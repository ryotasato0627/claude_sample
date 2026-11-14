---
paths:
  - "frontend/src/**"
---

# Frontend

- **API の型は `api/openapi.yaml` から生成した `src/api/schema.gen.ts` を使う。** 手書きで重複定義しない。型が足りない場合は Frontend で埋めず、OpenAPI / Backend 側の変更が必要だと報告する。
- OpenAPI に無い API を前提に実装しない。
- サーバー状態は TanStack Query で管理する。コンポーネントから直接 `fetch` しない。API 呼び出しは `src/api/` に集約する。
- JWT の付与と 401 時の扱いは `src/api/client.ts` の 1 か所で行う。セッションは `src/auth/` で管理する。
- **権限による UI 制御は UX のためのもの。** 最終的な判定は Backend が行う。ロール判定は 1 か所のヘルパーに集約し、権限マトリクス(`docs/spec/requirements.md` 第2章)に従う。
- エラー状態とローディング状態を必ず扱う。
- `any` を使わない。型アサーション(`as`)は最小限にする。
- API のベース URL などは環境変数で扱う。トークンなどの秘密情報をログに出さない。

```bash
docker compose run --rm frontend npm run typecheck
docker compose run --rm frontend npm run lint
```
