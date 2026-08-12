# CLAUDE.md — kanonサイト

## プロジェクト概要
kanon さん向けのリンクまとめページ（1ページ完結）。
訪問者を各SNS・外部サイトへ誘導することが目的。

詳細な仕様・素材の状況は `kanonサイト.md` を参照。

## 構成
```
kanonサイト/
├── CLAUDE.md          # このファイル（作業ルール）
├── kanonサイト.md      # 仕様・進捗・素材リスト
├── index.html         # 本体（未作成）
├── css/style.css      # スタイル（未作成）
└── images/            # 写真・アイコン素材（未作成）
```

## 作業ルール
- **1ファイル完結を優先**：ページ数が増えない限り index.html + css/style.css のみ
- **スマホ最優先**：SNSプロフィールから飛んでくる想定。PCは後回しでよい
- **外部リンクは必ず** `target="_blank" rel="noopener noreferrer"`
- **素材が未定の箇所**はダミー画像・ダミーURL（`#`）を入れて、`kanonサイト.md` の「未確定リスト」に記載する
- **CSSの注意**：`.nav` などの要素クラスに単独で `display` を指定しない
  （`visible_pc` / `visible_sp` との詳細度衝突でスマホ表示が崩れる。過去に禄・トロイメライで再発）

## 公開方法
GitHub Pages で公開予定（RINA・kotoha と同じ手順）。
リポジトリ名・URL は決定後に `kanonサイト.md` へ記録する。
