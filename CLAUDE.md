# CLAUDE.md

タスク管理のサンプルアプリ。Claude Code の Skill / Agent を使った開発ワークフローを試すためのもの。

- Backend: Go + Gin / PostgreSQL / sqlc / golang-migrate(`backend/`)
- Frontend: TypeScript + React + Vite + TanStack Query(`frontend/`)
- API 仕様: `api/openapi.yaml`。Backend / Frontend のコードはここから生成する

## 正とするドキュメント

作業前に関連する箇所を読む。存在しないファイルや、書かれていない仕様を推測で補わない。

| ドキュメント | 内容 |
|---|---|
| `docs/spec/requirements.md` | 要件、権限マトリクス(第2章)、API の共通規約(第4章)、データモデル(第5章)、Backend アーキテクチャ(第7.1章) |
| `api/openapi.yaml` | API 仕様(唯一の正) |
| `docs/development/branching-strategy.md` | ブランチ戦略(Git Flow) |
| `docs/development/pull-request.md` | PR の粒度・記載内容・レビュー基準 |
| `docs/development/plans/` | 実装計画と進捗 |

レイヤーやファイル種別ごとの詳細ルールは `.claude/rules/` にあり、該当するファイルを扱うときに読み込まれる。

## コマンド

Go / Node はホストに入れない。すべてコンテナ内で実行する。

```bash
make up          # 起動(DB → マイグレーション → API / 画面)
make generate    # OpenAPI・SQL からコード生成(sqlc / oapi-codegen / openapi-typescript)
make lint        # go vet / golangci-lint(depguard) / eslint / tsc
make test        # Backend / Frontend のテスト
make migrate-up  # マイグレーション適用(make migrate-down で 1 つ戻す)
```

個別に実行する場合:

```bash
docker compose run --rm backend go test ./...
docker compose run --rm frontend npm test
```

## 共通のルール

- 変更は最小限にする。要求されていない機能追加や、無関係なリファクタリングをしない。
- 生成物(`*.gen.go`、`schema.gen.ts`、`sqlcgen/`)は手で編集しない。元の定義(OpenAPI / SQL)を直して `make generate` する。
- API key・パスワード・トークンなどの秘密情報を、コード・ログ・イメージに含めない。設定は環境変数で渡す。`.env` は読まない。
- テストや lint を実行していないのに、成功したと報告しない。実行できなかった場合は理由を書く。
- 権限は `docs/spec/requirements.md` 第2章の権限マトリクスが正。最終的な判定は Backend の `service` で行い、Frontend の制御は UX のためのものとする。

## ワークフロー

- ブランチは Git Flow に従う。`main` / `develop` に直接コミットしない。
- 実装を始める前に、`pr-strategy` Skill で PR 計画を、`commit-strategy` Skill でコミット計画を立てる。
- コミットメッセージは `<type>: <要約>`(type は feat / fix / refactor / test / docs / chore)。

| 種別 | 名前 | 用途 |
|---|---|---|
| Agent | `backend-dev` / `frontend-dev` | 実装 |
| Agent | `test-writer` | テスト追加(権限を重点的に) |
| Agent | `reviewer` | レビュー(コードは変更しない) |
| Agent | `pr-creater` | レビュー済みの実装から PR を作成 |
| Skill | `add-endpoint` / `add-migration` | エンドポイント・マイグレーションの追加手順 |
| Skill | `pr-strategy` / `commit-strategy` | PR・コミットの分割計画 |
| Skill | `pr-review` | レビューの手順と出力形式 |
