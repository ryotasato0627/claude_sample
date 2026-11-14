---
name: add-endpoint
description: 新しいAPIエンドポイントを追加する手順。OpenAPI更新 → コード生成 → domain/service/repository/handler の実装 → 権限チェック → テストまで、依存の向きを守って進める。エンドポイントの追加・変更を求められたときに使う。
---

# Add Endpoint Skill

## Purpose

エンドポイントを、仕様(OpenAPI)起点かつ依存性逆転のルールを守って追加する。
ルールは `.claude/rules/openapi.md` と `.claude/rules/backend-architecture.md`、権限は `docs/spec/requirements.md` 第2章を正とする。

## Steps

### 1. 仕様を確認する

* `docs/spec/requirements.md` の該当機能と権限マトリクスを読む
* どのロール(Owner / Member / Viewer)が実行できるか、未認証・非メンバーの扱いを決める
* 仕様が不明な場合は、実装を始める前に確認する

### 2. OpenAPI を更新する(最初に行う)

* `api/openapi.yaml` にパス、リクエスト/レスポンス、認証(Bearer)、エラー(401 / 403 / 404 / 422)を定義する
* コード生成を実行する(手で生成物を編集しない)

```bash
# 具体的なコマンドは Makefile / compose のサービス定義に従う
docker compose run --rm sqlc generate        # SQL を追加した場合
make generate                                # oapi-codegen / openapi-typescript
```

* 認証が不要な場合の `publicPaths`、`format` の扱いは `.claude/rules/openapi.md` に従う

### 3. 内側から順に実装する(依存の向きを守る)

1. **domain**: 必要ならエンティティ・Policy(権限判定)を追加。標準ライブラリのみ依存
2. **service**: ユースケースを追加し、必要な port(interface)を **service パッケージ内で定義**する。権限チェックはここ
3. **repository**: port を実装。`db/queries/*.sql` に sqlc クエリを追加(DB 変更が必要なら `add-migration` Skill)。sqlc の型を `domain` に変換して返す
4. **handler**: gin のハンドラ。入力の検証・変換のみ行い、`service` は自パッケージ定義の interface 越しに呼ぶ。`*gin.Context` を渡さない
5. **cmd/server/app.go**(`newRouter`): 新しい依存があればここで生成・注入する(他で組み立てない)

### 4. テストを書く(`test-writer` Agent に任せてもよい)

* service: fake を注入し、**操作 × ロール**(Owner / Member / Viewer / 非メンバー / 未認証)を網羅
* handler: `httptest` で 401 / 403 / 404 / 422 と正常系を確認
* repository: 実 DB(compose の `db`)

### 5. 検証する

```bash
docker compose run --rm backend go vet ./...
docker compose run --rm backend golangci-lint run   # depguard による依存方向チェック
docker compose run --rm backend go test ./...
```

Frontend が絡む場合は生成した型を使い、`frontend-dev` Agent の手順に従う。

### 6. ドキュメントを更新する

* `docs/spec/requirements.md` 第4章のエンドポイント一覧(追加・変更があった場合)

## Checklist

- [ ] 認証不要なら `security: []` と `publicPaths` の両方に書いた
- [ ] 未メンバーには 404、権限不足には 403 を返している
- [ ] OpenAPI を先に更新し、生成物を再生成した(手編集なし)
- [ ] 権限が権限マトリクスと一致している(service 内で判定)
- [ ] 他プロジェクトのリソースを ID 指定で操作できない
- [ ] `service` が repository / infra / gin / sqlc を import していない
- [ ] interface を使う側(service)で定義した
- [ ] 依存の組み立ては `cmd/server` のみ
- [ ] vet / lint / test が通った
- [ ] 要件書のエンドポイント一覧を更新した
