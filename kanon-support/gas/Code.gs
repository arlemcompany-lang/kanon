/**
 * kanon 支援サイト － 男優・撮影スタッフ 応募フォーム 受信処理
 *
 * やること
 *   1. 応募内容をスプレッドシートに1行追加
 *   2. 購入スクショを Drive のフォルダに保存し、そのリンクを行に入れる
 *   3. 応募があったことをメールで通知
 *
 * 使いはじめる手順
 *   1. このエディタで setup を選んで「実行」を1回だけ押す
 *      → 権限の確認が出るので許可する
 *      → 保存用のスプレッドシートとDriveフォルダが自動で作られる
 *   2. 実行ログに出たスプレッドシートのURLを控える（応募はここに並ぶ）
 *   3. デプロイ済みのウェブアプリURLをサイト側に貼れば完成
 *
 * 注意
 *   応募段階で身分証は受け取らない設計。ここに身分証を集める処理を足さないこと。
 *   （漏えい時の被害が大きいため。本人確認は当選連絡のあと、別の手段で行う）
 */

var SETTINGS = {
  sheetName:       '応募一覧',
  notifyEmail:     'hello@arlem-ai.com',
  spreadsheetName: 'kanon支援サイト 応募一覧',
  folderName:      'kanon支援サイト 応募スクショ'
};

var HEADERS = ['応募日時', '希望する役割', 'myfansアカウント名', 'ひとこと', 'スクショ', '状態', 'メモ'];

// ============================================================
//  最初に1回だけ実行する
// ============================================================

/**
 * 保存先のスプレッドシートとDriveフォルダを作り、IDを覚えさせる。
 * すでに作ってある場合は作り直さず、そのまま使う。
 */
function setup() {
  var props = PropertiesService.getScriptProperties();

  var ssId = props.getProperty('SPREADSHEET_ID');
  if (!ssId || !exists_(ssId, 'file')) {
    var ss = SpreadsheetApp.create(SETTINGS.spreadsheetName);
    ssId = ss.getId();
    props.setProperty('SPREADSHEET_ID', ssId);
  }

  var folderId = props.getProperty('FOLDER_ID');
  if (!folderId || !exists_(folderId, 'folder')) {
    var folder = DriveApp.createFolder(SETTINGS.folderName);
    folderId = folder.getId();
    props.setProperty('FOLDER_ID', folderId);
  }

  formatSheet_();

  var ssUrl = 'https://docs.google.com/spreadsheets/d/' + ssId + '/edit';
  var folderUrl = 'https://drive.google.com/drive/folders/' + folderId;

  Logger.log('準備ができました。');
  Logger.log('応募一覧（スプレッドシート）：' + ssUrl);
  Logger.log('スクショ保存先（Driveフォルダ）：' + folderUrl);

  MailApp.sendEmail(
    SETTINGS.notifyEmail,
    '【kanon支援サイト】応募フォームの準備ができました',
    '応募一覧（スプレッドシート）：\n' + ssUrl + '\n\n' +
    'スクショ保存先（Driveフォルダ）：\n' + folderUrl + '\n\n' +
    '応募があると、このアドレスに通知が届きます。'
  );

  return ssUrl;
}

// ============================================================
//  フォームからの受信
// ============================================================

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
      // 共有設定は変えない。フォルダにアクセスできる人だけが見られる状態のまま
      var file = getFolder_().createFile(blob);
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
      SETTINGS.notifyEmail,
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

// ============================================================
//  後片付け
// ============================================================

/**
 * 選考が終わったあとの後始末用。
 * 「状態」列を「削除可」にした行のスクショだけを Drive から削除する。
 * 行そのものは残す（誰に連絡したかの記録のため）。
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
      // すでに消えている場合は何もしない
    }
  }
  Logger.log('削除したスクショ：' + removed + '件');
}

// ============================================================
//  内部処理
// ============================================================

function getSheet_() {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!ssId) throw new Error('setup がまだ実行されていません');

  var ss = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName(SETTINGS.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS.sheetName);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function getFolder_() {
  var folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!folderId) throw new Error('setup がまだ実行されていません');
  return DriveApp.getFolderById(folderId);
}

/** 見出し・列幅・書式を整える */
function formatSheet_() {
  var sheet = getSheet_();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  // 最初のシート（Sheet1）が空のまま残っていたら消す
  var ss = sheet.getParent();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name !== SETTINGS.sheetName && sheets[i].getLastRow() === 0 && sheets.length > 1) {
      ss.deleteSheet(sheets[i]);
    }
  }

  sheet.getRange(1, 1, 1, HEADERS.length)
       .setFontWeight('bold')
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

/** 応募があったことをメールで知らせる */
function notify_(data, imageUrl) {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var body =
    '応募がありました。\n\n' +
    '希望する役割：' + (data.role || '') + '\n' +
    'myfansアカウント名：' + (data.account || '') + '\n' +
    'ひとこと：' + (data.message || '（なし）') + '\n' +
    'スクショ：' + (imageUrl || '（添付なし）') + '\n\n' +
    '応募一覧：\n' +
    'https://docs.google.com/spreadsheets/d/' + ssId + '/edit';

  MailApp.sendEmail(SETTINGS.notifyEmail, '【kanon支援サイト】新しい応募', body);
}

/** IDのファイル・フォルダが実在するか */
function exists_(id, kind) {
  try {
    if (kind === 'folder') { DriveApp.getFolderById(id); }
    else { DriveApp.getFileById(id); }
    return true;
  } catch (err) {
    return false;
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
