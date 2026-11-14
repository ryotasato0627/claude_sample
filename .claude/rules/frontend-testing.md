---
paths:
  - "frontend/src/**/*.test.ts"
  - "frontend/src/**/*.test.tsx"
---

# Frontend のテスト

- Vitest + Testing Library を使う。テストは対象と同じディレクトリに `*.test.ts(x)` で置く。既存テストのヘルパーの書き方に従う。
- **ユーザーから見える振る舞いをテストする。** 要素はロール・ラベル・表示テキストで取得し、実装の詳細(内部 state、クラス名など)に依存しない。
- API は `src/api/client` をモックする(`vi.mock`)。実際の通信をしない。
- Query は、テストごとに `retry: false` の `QueryClient` を新しく作り、キャッシュをテスト間で共有しない。
- 正常系に加えて、ローディング・エラー(401 / 403 / 404 / 422 / 500)・空の状態を確認する。
- ロールに応じた表示の出し分け(ボタンの有無など)を、権限マトリクス(`docs/spec/requirements.md` 第2章)に照らして確認する。
- 仕様から導いたケースを書く。実装が仕様と食い違う場合、テストを実装に合わせて曲げない。
- 時刻や実行順序に依存する不安定なテストを書かない。時刻が関わる場合は `vi.useFakeTimers` などで固定する。

```bash
docker compose run --rm frontend npm test
```
