# 人別・月別の稼働時間・支給額ダッシュボード

`static/data/` に配置した `timecard.csv`、`member.csv`、`fee.csv` を使って、月別の稼働状況と支給額を表示するWebアプリです。

## ブラウザアプリ

`static/index.html` は、認証付きDenoサーバーから配信します。月を選ぶと日別の稼働状況・その日の支給額・月合計を表示します。未ログイン時は `public/` の認証画面だけを配信し、ログイン後は `static/` 以下のコンテンツを配信します。

## 公開用の認証付き起動

`server.ts` はDenoで動作する認証付きサーバーです。WebAuthnのパスキーをサーバーで検証し、認証済みユーザーにだけダッシュボードとCSVを配信します。

1. `.env.example` を `.env` にコピーし、`ADMIN_NAME` を管理者の名前に変更します。複数人の場合はカンマ区切りで指定します（例: `ADMIN_NAME=管理者A,管理者B`）。
2. 本番では `RP_ID` を公開ドメイン、`ORIGIN` を公開URL（`https://...`）に設定します。
3. `deno task start` で起動します。
4. 最初に `ADMIN_NAME` と同じ名前で新規登録すると管理者になります。一般メンバーの登録は管理者承認後に利用可能です。

```bash
cp .env.example .env
# .env の ADMIN_NAME / RP_ID / ORIGIN を設定
deno task start
```

管理者画面では、登録者ごとに「利用可にする」「無効化」「削除」を操作できます。セッションCookieはブラウザ終了時に破棄され、サーバー側でも3時間で失効します。`data/auth.json` にはパスフレーズのハッシュとパスキーの公開鍵だけが保存され、秘密鍵は保存しません。

本番公開時は、DenoサーバーをHTTPSリバースプロキシの背後で動かしてください。WebAuthnは通常、HTTPS（またはlocalhost）でのみ利用できます。
