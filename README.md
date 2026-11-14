# Task Management(Claude Code Skill / Agent サンプル)

Claude Code の Skill / Agent を使った開発ワークフローを試すための、タスク管理サンプルアプリ。

- Backend: Go + Gin / PostgreSQL / sqlc / golang-migrate
- Frontend: TypeScript + React + Vite + TanStack Query
- API 仕様: `api/openapi.yaml`(唯一の正。Backend / Frontend のコードはここから生成)
- 要件・設計: [`docs/spec/requirements.md`](docs/spec/requirements.md)

## 必要なもの

Docker(Docker Compose)と make だけ。Go / Node はホストに不要(すべてコンテナ内で実行する)。

## 使い方

```bash
make up          # .env を作成し、DB → マイグレーション → API/画面まで起動
```

| URL | 内容 |
|---|---|
| http://localhost:5173 | Frontend(`/api` は Backend へプロキシ) |
| http://localhost:8080/api/health | Backend |
| `localhost:5433` | PostgreSQL(ポートは `.env` の `DB_PORT`) |

```bash
make test        # Backend / Frontend のテスト
make lint        # go vet / golangci-lint(依存方向の検査を含む) / eslint / 型チェック
make generate    # OpenAPI・SQL からコード生成(sqlc / oapi-codegen / openapi-typescript)
make migrate-up  # マイグレーション適用(`make migrate-down` で 1 つ戻す)
make down        # 停止
```

生成物(`*.gen.go`、`schema.gen.ts`、`sqlcgen/`)は手で編集しない。CI で `make generate` の差分を検査する。

## Claude Code

| 種別 | 名前 | 用途 |
|---|---|---|
| Agent | `backend-dev` / `frontend-dev` | 実装 |
| Agent | `test-writer` | テスト追加(権限を重点的に) |
| Agent | `reviewer` | レビュー(コードは変更しない) |
| Skill | `add-endpoint` / `add-migration` / `pr-review` | 定型手順 |

共通ルールは [`CLAUDE.md`](CLAUDE.md)、レイヤーごとの詳細ルールは [`.claude/rules/`](.claude/rules/) に置く。ブランチ戦略・PR ルールは [`docs/development/`](docs/development/) を参照。
