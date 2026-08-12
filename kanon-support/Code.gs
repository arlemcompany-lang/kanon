/**
 * kanon 支援サイト － 男優・撮影スタッフ 応募フォーム 受信処理
 *
 * やること
 *   1. 応募内容をスプレッドシートに1行追加
 *   2. 購入スクショを Drive のフォルダに保存し、そのリンクを行に入れる
 *   3. 応募があったことをメールで通知
 *
 * デプロイ手順
 *   1. CONFIG.spreadsheetId に、回答を保存するスプレッドシートのIDを入れる
 *      （スプレッドシートURLの /d/ と /edit の間の文字列）
 *   2. CONFIG.folderId に、スクショを保存する Drive フォルダのIDを入れる
 *      （フォルダURLの末尾の文字列。フォルダは「自分だけ」の共有設定のままにする）
 *   3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *        実行ユーザー：自分
 *        アクセスできるユーザー：全員
 *   4. 発行された /exec URL を index.html の GAS_URL に貼る
 *
 * 注意
 *   応募段階で身分証は受け取らない設計。ここに身分証を集める処理を足さないこと。
 *   （漏えい時の被害が大きいため。本人確認は当選連絡のあと、別の手段で行う）
 */

var CONFIG = {
  spreadsheetId: 'ここにスプレッドシートIDを入れる',
  folderId:      'ここにDriveフォルダIDを入れる',
  sheetName:     '応募一覧',
  notifyEmail:   'hello@arlem-ai.com'
};

var HEADERS = ['応募日時', '希望する役割', 'myfansアカウント名', 'ひとこと', 'スクショ', '状態', 'メモ'];

function doPost(e) {
  try {
    // 日本語の文字化けを防ぐため、クライアント側でBase64にしたものを受け取っている
    var jsonStr = Utilities.newBlob(Utilities.base64Decode(e.postData.contents)).getDataAsString('UTF-8');
    var data = JSON.parse(jsonStr);

    var sheet = getSheet_();
    var now = new Date();

    // ── スクショを Drive に保存 ──
    var imageUrl = '';
    if (data.image) {
      var stamp = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
      var safeName = String(data.account || 'unknown').replace(/[^0-9A-Za-z_\-]/g, '_');
      var blob = Utilities.newBlob(
        Utilities.base64Decode(data.image),
        'image/jpeg',
        stamp + '_' + safeName + '.jpg'
      );
      var file = DriveApp.getFolderById(CONFIG.folderId).createFile(blob);
      // 共有はしない（フォルダにアクセスできる人だけが見られる状態のまま）
      imageUrl = file.getUrl();
    }

    sheet.appendRow([
      now,
      data.role    || '',
      data.account || '',
      data.message || '',
      imageUrl,
      '未確認',
      ''
    ]);

    notify_(data, imageUrl);

    return json_({ ok: true });

  } catch (err) {
    // 失敗しても応募者側には理由を出さない。管理者にだけ知らせる
    MailApp.sendEmail(
      CONFIG.notifyEmail,
      '【kanon支援サイト】応募の保存に失敗しました',
      'エラー内容：\n' + err + '\n\n受信データの先頭200文字：\n' +
      String(e && e.postData && e.postData.contents).slice(0, 200)
    );
    return json_({ ok: false });
  }
}

function doGet() {
  return json_({ ok: true, message: 'kanon support form endpoint' });
}

/** シートを取得（無ければ見出し付きで作る） */
function getSheet_() {
  var ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  var sheet = ss.getSheetByName(CONFIG.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.sheetName);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

/** 応募があったことをメールで知らせる（本文に個人情報は最小限） */
function notify_(data, imageUrl) {
  var body =
    '応募がありました。\n\n' +
    '希望する役割：' + (data.role || '') + '\n' +
    'myfansアカウント名：' + (data.account || '') + '\n' +
    'ひとこと：' + (data.message || '（なし）') + '\n' +
    'スクショ：' + (imageUrl || '（添付なし）') + '\n\n' +
    'スプレッドシート：\n' +
    'https://docs.google.com/spreadsheets/d/' + CONFIG.spreadsheetId + '/edit';

  MailApp.sendEmail(CONFIG.notifyEmail, '【kanon支援サイト】新しい応募', body);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 初回セットアップ用。エディタから1回だけ手で実行する。
 * シートの見出しを作り、列幅と書式を整える。
 */
function setupSheet() {
  var sheet = getSheet_();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  var head = sheet.getRange(1, 1, 1, HEADERS.length);
  head.setFontWeight('bold')
      .setBackground('#7c1e38')
      .setFontColor('#ffffff')
      .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 150); // 応募日時
  sheet.setColumnWidth(2, 110); // 役割
  sheet.setColumnWidth(3, 170); // アカウント名
  sheet.setColumnWidth(4, 300); // ひとこと
  sheet.setColumnWidth(5, 260); // スクショ
  sheet.setColumnWidth(6, 90);  // 状態
  sheet.setColumnWidth(7, 240); // メモ
  sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).setWrap(true);
  sheet.getRange('A2:A').setNumberFormat('yyyy/MM/dd HH:mm');
}

/**
 * 選考が終わったあとの後始末用。
 * 「状態」列が「削除可」の行について、スクショのDriveファイルをゴミ箱に入れ、
 * リンクを消す。行そのものは残す（誰に連絡したかの記録のため）。
 */
function cleanupScreenshots() {
  var sheet = getSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return;

  var rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var removed = 0;

  for (var i = 0; i < rows.length; i++) {
    var url = rows[i][4];
    var state = rows[i][5];
    if (state !== '削除可' || !url) continue;

    var m = String(url).match(/[-\w]{25,}/);
    if (!m) continue;
    try {
      DriveApp.getFileById(m[0]).setTrashed(true);
      sheet.getRange(i + 2, 5).setValue('（削除済み）');
      removed++;
    } catch (err) {
      // 既に消えている場合は何もしない
    }
  }
  Logger.log('削除したスクショ：' + removed + '件');
}
