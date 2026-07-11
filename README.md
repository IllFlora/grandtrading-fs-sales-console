# Grand Trading FS Sales Console

FSはスプレッドシートを編集せず、GitHub Pages上のWebアプリだけを操作します。スプレッドシートは管理者用のリードマスター・サマリー・活動履歴です。

## 正本

- Google Sheet: `GrandTrading 営業管理CRM｜管理者用`
- Spreadsheet ID: `1F84uPktW-sY8Sf3riBHxUw_NZAymTGHOMEI_7DgfVnE`
- `01_リードマスター`: 1行1リードの現在状態
- `02_活動履歴`: Webアプリからの操作を追記する変更履歴
- `03_設定`: 選択肢とFSアカウント
- `04_追加リスト取込`: 管理者が新しいリードを追加するための列テンプレート

## FS操作

1. 「行き先を探す」でエリア・業種・スコアから訪問先を選びます。
2. 訪問予定日と訪問順を登録します。
3. 「今日の訪問」で順番とGoogleマップを確認します。
4. 現地で訪問結果、商談結果、次回対応、活動メモを登録します。
5. リードマスターの現在状態を更新し、活動履歴へ1行追記します。

## Google OAuth

Google Cloud ConsoleでGoogle Sheets APIを有効化し、ウェブアプリ用OAuth Client IDを作成します。承認済みJavaScript生成元へGitHub Pages URLを追加し、`config.js` の `googleClientId` を差し替えます。FS3名には対象スプレッドシートの編集権限を付与します。

リポジトリには営業リスト本体や認証トークンを保存しません。データはGoogleログイン後にSheets APIから取得します。

