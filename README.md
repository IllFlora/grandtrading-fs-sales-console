# Grand Trading FS内製CRM｜納品案内

FS3名はWebアプリだけを使い、管理者はGoogle Sheetsでリード・活動・進捗・分析を確認する営業管理システムです。

## 本番URL

- Webアプリ: https://illflora.github.io/grandtrading-fs-sales-console/
- 管理者用Google Sheets: https://docs.google.com/spreadsheets/d/1F84uPktW-sY8Sf3riBHxUw_NZAymTGHOMEI_7DgfVnE/edit
- 納品説明Google Slides: https://docs.google.com/presentation/d/1yOR7g1TzWCt0f-bScvPKY5CjJ4r8aPJKQQzhAFZX0X8/edit
- FS操作説明書PDF: https://drive.google.com/file/d/11oLOpKZxAHHX6P71ppiZnWarf_GSgORq/view

## 運用

- FS: GoogleアカウントでWebへログインし、訪問予定・電話・訪問・商談結果・次回対応を登録
- 管理者: Sheetsの `00_管理者サマリー` と `07_FS分析ボード` を確認
- リード追加: 管理者は `04_追加リスト取込`、FSはWebの `リスト外活動` を使用

## Google Sheets構成

1. `00_管理者サマリー` — 全体件数、フェーズ、担当者、直近の「誰が・いつ・何を」
2. `01_リードマスター` — 700件の正本
3. `02_活動履歴` — 電話・訪問・商談を追記保存
4. `03_設定` — FSユーザーと権限
5. `04_追加リスト取込` — 管理者用の追加リード取込
6. `05_削除依頼` — FSの削除依頼と管理者の承認・却下履歴
7. `07_FS分析ボード` — 担当者・期間別KPI、ファネル、日次推移、業種、現在フェーズ

## 分析期間

デフォルトは過去30日です。`今日 / 過去7日 / 過去30日 / 今月 / カスタム` を選択できます。カスタム時は開始日・終了日をカレンダーで指定します。

## 主なWeb機能

- Googleログインと登録ユーザー制御
- エリア・業種・ステータス・スコア検索
- 1分での予定／活動結果登録
- 企業単位の活動タイムライン
- 本人またはマスターによる履歴編集
- 変更有無を明示する未保存表示
- FSの活動削除依頼と、管理者ロールによるワンクリック削除・却下
- 訪問予定のGoogleカレンダー同時登録
- リスト外活動からリードと活動を同時登録
- マスターによるテスト結果削除・企業初期化

## 納品ファイル

- `GrandTrading_FS内製CRM_納品説明資料.pptx`
- `GrandTrading_FS操作説明書.pdf`
- `GrandTrading_営業リスト_最終選定_約700件.csv`
- `sales-list-app/`

## 権限メモ

Web利用には、Google OAuthの許可対象、`03_設定` の有効なFSユーザー登録、対象Google Sheetsの編集権限の3点が必要です。カレンダー登録にはGoogle Calendar APIと `calendar.events` 権限も使用します。FSはシートを直接操作しませんが、本人のGoogle権限でAPIへ書き込むため共有が必要です。マスターは `neosanepix@gmail.com` です。
