# Android アプリとして公開する（予定）

頭痛ログと同じく、PWA を TWA（Trusted Web Activity）にして Play ストアに公開する想定です。
TWA は端末の Chrome で動くので、Google ログイン（ポップアップ）・カメラ・オフライン保存は Web 版と同じ仕組みで使えます。

## 公開前にやること

1. 公開先を決める（例: `https://leadlog.doitmyself.net/`）。GitHub Pages ＋独自ドメインの場合は、`public/CNAME` を置く。
2. Google Cloud Console の OAuth クライアントの「承認済みの JavaScript 生成元」に、公開先の URL を追加する。
3. PNG アイコンを用意して `vite.config.ts` の manifest に追加する（192×192・512×512・maskable の 192/512）。
   今は SVG（`public/favicon.svg`）だけ。
4. プライバシーポリシー（`public/privacy.html`）の内容・連絡先を確認する。
5. ストア用の画像（フィーチャーグラフィック 1024×500、スクリーンショット）を用意する。

## アプリ本体（AAB）の作り方

頭痛ログの `docs/play-store.md` と同じ手順（PWABuilder → Android → 署名鍵の作成 → `public/.well-known/assetlinks.json` で紐づけ）。
パッケージ名の案: `net.doitmyself.exhibitionleadlog`

## 社内だけで配る場合

Play ストアに公開せず、社内の人だけが使う場合は、ストア公開は不要です。
Android の Chrome で公開先を開き、メニューの「ホーム画面に追加」（アプリをインストール）で、アプリと同じように使えます。
