---
paths:
  - "api/**"
---

# OpenAPI

`api/openapi.yaml` が API 仕様の唯一の正。API の変更はここから始める。

- API を変える場合は、**先に `api/openapi.yaml` を更新し、`make generate` してから実装する。** 生成物(`api.gen.go` / `schema.gen.ts`)は手で編集しない。CI の `codegen-check` が差分を検査する。
- エラーのステータスと本文は `docs/spec/requirements.md` 第4章「共通の規約」に従う(401 / 403 / 404 / 409 / 422 など。本文は `{"code", "message"}`)。
- 認証が不要なエンドポイントは `security: []` を付け、`backend/internal/handler/http.go` の `publicPaths` にも追加する。両者の一致は `spec_test.go` が検査する。
- 形式エラーを 422 にしたい項目(例: メールアドレス)には `format` を付けない。付けると生成コードのデコード時点で 400 になる。形式は `service` で検証する。
- エンドポイントを追加・変更したら、`docs/spec/requirements.md` 第4章のエンドポイント一覧も更新する。

手順は `add-endpoint` Skill を参照する。
