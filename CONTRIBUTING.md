# 開発ガイド

Bun 1.4.4 以上を使用します。依存関係は `bun install --frozen-lockfile` で復元してください。追加・変更した場合は `package.json` と `bun.lock` を一緒にコミットします。

## 変更前後のチェック

```bash
bun run check
bun run build
bun run test:e2e
```

初回の E2E 実行前に `bunx playwright install chromium` を実行します。Linux で必要な共有ライブラリーがない場合は、対応環境で `bunx playwright install --with-deps chromium` を使ってください。

整形は `bun run format`、lint の安全な自動修正は `bun run check:fix` です。shadcn/ui の配布コンポーネントは `src/components/ui/` にあり、Biome の対象外にしています。TypeScript のチェック対象には含みます。

`useExhaustiveDependencies` は現状のイベントハンドラー・カーソル追従処理に合わせて無効にしています。Effect を変更する際は、古い状態の参照やリスナーの解除漏れがないことを確認してください。CSS のレスポンシブ上書きと reduced motion のため、セレクターの詳細度順・`!important` に関するスタイル規則も無効です。

## コードの配置

- `src/App.tsx`: プロジェクト状態、音声再生、同期操作、エディター
- `src/components/LrclibSearch.tsx`: LRCLIB 検索ダイアログ
- `src/components/ui/`: shadcn/ui コンポーネント
- `src/lib/lrc.ts`: LRC の読み込み・書き出し
- `src/lib/editor.ts`: カーソル行の解析・スタンプ・微調整
- `src/lib/lrclib.ts`: LRCLIB API、取得した歌詞の取り込み
- `src/index.css`: Tailwind と画面レイアウト
- `src/lib/*.test.ts`: Bun の単体テスト
- `tests/*.spec.ts`: Playwright の操作テスト

E2E テストは 4173 番ポートに専用サーバーを起動します。通常の開発サーバーの 5173 番ポートとは別です。LRCLIB の操作テストは API をモックし、外部サービスや実際の歌詞データに依存しません。

## コミット

```bash
git status
bun run check
git add <変更したファイル>
git commit -m "変更の内容"
```

ビルド成果物・依存関係・テストレポート・ローカル環境設定は Git 管理から除外しています。CI は GitHub にリポジトリを配置した場合に、チェック・ビルド・Chromium の操作テストを実行します。
