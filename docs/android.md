# Android アプリとして公開する（予定）

頭痛ログと同じく、PWA を TWA（Trusted Web Activity）にして Play ストアに公開する想定です。
TWA は端末の Chrome で動くので、Google ログイン（ポップアップ）・カメラ・オフライン保存は Web 版と同じ仕組みで使えます。

## 公開前にやること

1. 公開先: `https://leadlog.doitmyself.net/`（`public/CNAME` 済み。Value-Domain で CNAME `leadlog` → `fuuchan-lab.github.io` を設定する）
2. OAuth クライアント（プロジェクト「LeadLog」）の「承認済みの JavaScript 生成元」に公開先を登録済み。
   多くの人に使ってもらう場合は、OAuth 同意画面を「本番環境」に切り替える（テスト中はテストユーザーだけがログインできる）。
3. アイコンは用意済み（`public/icon-*.png`・`icon-maskable-*.png`・`apple-touch-icon.png`・favicon）。
4. プライバシーポリシー（`public/privacy.html`）の内容・連絡先を確認する。
5. ストア用の画像（フィーチャーグラフィック 1024×500、スクリーンショット）を用意する。

## アプリ本体（AAB）の作り方

頭痛ログの `docs/play-store.md` と同じ手順（PWABuilder → Android → 署名鍵の作成 → `public/.well-known/assetlinks.json` で紐づけ）。
パッケージ名の案: `net.doitmyself.leadlog`

## 社内だけで配る場合

Play ストアに公開せず、社内の人だけが使う場合は、ストア公開は不要です。
Android の Chrome で公開先を開き、メニューの「ホーム画面に追加」（アプリをインストール）で、アプリと同じように使えます。
