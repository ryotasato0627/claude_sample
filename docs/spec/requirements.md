# 要件定義

Claude Code の Skill / Agent を使った開発ワークフローを試すためのサンプルアプリ(タスク管理)。

## 1. 技術スタック(確定)

| 領域 | 採用 | 理由 |
|---|---|---|
| Backend | Go + Gin | - |
| Frontend | TypeScript + React + Vite + TanStack Query | 状態管理を過剰に複雑化しない |
| DB | PostgreSQL | - |
| DBアクセス | `database/sql` + sqlc | SQLが明示的で、Repository層の責務が分かりやすい |
| Migration | golang-migrate | Go では定番。Migration 自体を Skill の題材にできる |
| API仕様 | OpenAPI(`api/openapi.yaml`) | Backend / Frontend / Agent 間の共通仕様。唯一の正とする |
| 認証 | メール+パスワード、JWT | - |
| 権限 | プロジェクト単位ロール | - |
| 実行環境 | Docker / Docker Compose | 第9章 |
| リポジトリ構成 | モノレポ(`backend/` + `frontend/`) | PoC として扱いやすい |
| Skill/Agent の用途 | 開発ワークフロー(アプリ機能への組み込みはしない) | - |

## 2. ロール

プロジェクトごとに以下のいずれかを持つ。プロジェクト作成者は Owner になる。

| 操作 | Owner | Member | Viewer |
|---|:-:|:-:|:-:|
| プロジェクト閲覧・Task検索 | ○ | ○ | ○ |
| Task作成・編集 | ○ | ○ | - |
| ステータス変更 | ○ | ○ | - |
| 担当者変更 | ○ | ○ | - |
| コメント投稿 | ○ | ○ | - |
| コメント編集・削除 | 全件 | 自分のみ | - |
| Task削除 | ○ | - | - |
| メンバー追加・ロール変更・削除 | ○ | - | - |
| プロジェクト編集・削除 | ○ | - | - |

- プロジェクトには Owner が常に1人以上いる(最後の Owner は降格・退出不可)。

## 3. 機能要件

### 3.1 ユーザー登録・認証
- 登録項目: メールアドレス(一意)、表示名、パスワード(8文字以上、bcryptでハッシュ化)
- ログイン成功で JWT(アクセストークン)を返す。有効期限は 24 時間(リフレッシュトークンは対象外)
- 認証が必要な API は `Authorization: Bearer <token>`

### 3.2 プロジェクト
- 作成・一覧(自分が所属するもののみ)・詳細・更新・削除
- メンバー管理: メールアドレスで登録済みユーザーを追加、ロール変更、削除

### 3.3 Task
- 項目: タイトル(必須)、説明、ステータス、担当者(任意・1人)、作成者、作成/更新日時
- ステータス: `todo` / `in_progress` / `done`(3種類、遷移は自由。権限検証に集中するためワークフロー制御は入れない)
- 担当者にできるのは、そのプロジェクトのメンバーのみ(Viewer も可)

### 3.4 コメント
- Task に対する時系列のコメント(本文のみ、テキスト)

### 3.5 Task検索
- 条件: キーワード(タイトル・説明の部分一致)、ステータス、担当者、プロジェクト
- 自分が所属するプロジェクトの Task のみが対象
- ページネーション(limit/offset)、並び順は更新日時の降順

## 4. API概要

正は `api/openapi.yaml`。以下はエンドポイント一覧(案)で、追加・変更時は OpenAPI を先に更新する。

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id
GET    /api/projects/:id/members
POST   /api/projects/:id/members
PATCH  /api/projects/:id/members/:userId
DELETE /api/projects/:id/members/:userId
GET    /api/projects/:id/tasks
POST   /api/projects/:id/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id
PATCH  /api/tasks/:id/status
PATCH  /api/tasks/:id/assignee
DELETE /api/tasks/:id
GET    /api/tasks/:id/comments
POST   /api/tasks/:id/comments
PATCH  /api/comments/:id
DELETE /api/comments/:id
GET    /api/tasks/search
```

## 5. データモデル(案)

- users(id, email, name, password_hash, created_at)
- projects(id, name, description, created_at)
- project_members(project_id, user_id, role)  ※ role: owner / member / viewer
- tasks(id, project_id, title, description, status, assignee_id, created_by, created_at, updated_at)
- comments(id, task_id, user_id, body, created_at, updated_at)

## 6. 非機能・スコープ外
- スコープ外: メール通知、ファイル添付、リフレッシュトークン、ラベル/期限、リアルタイム更新、外部IdP
- テスト: Backend は Go 標準の testing(権限チェックを重点的に)、Frontend は Vitest 程度

## 7. Skill / Agent 構成

開発ワークフローで使う。まず以下の 4 Agent + 3 Skill で開始し、実際に使って不足を見つける(最初から細分化しない)。

**Agents**(`.claude/agents/`)
- `backend-dev`: Gin のハンドラ/サービス/リポジトリ実装、sqlc クエリ、マイグレーション作成。第7.1章の依存ルールを厳守する(作成済み)
- `frontend-dev`: React 画面・API クライアント実装(作成済み)
- `test-writer`: 権限(操作 × ロール)を中心にテスト追加。プロダクションコードは変更しない(作成済み)
- `reviewer`: 差分を要件(本書)・OpenAPI・権限マトリクス・依存の向きに照らしてレビュー。コードは変更しない(作成済み)

`coder` は Backend / Frontend で責務・ルール・実行コマンドが異なるため、`backend-dev` と `frontend-dev` に分割した。

**Skills**
- `add-endpoint`: 新規エンドポイント追加の手順(OpenAPI → コード生成 → domain → service → repository → handler → テスト)。作成済み
- `add-migration`: golang-migrate によるマイグレーションファイルの作成規約。作成済み
- `pr-review`: レビュー用 Skill(作成済み。`reviewer` Agent から利用する)

### 7.1 Backend アーキテクチャ(依存性逆転)

依存は常に外側から内側へ向ける。具体実装ではなく抽象に依存する。

```
cmd/server (composition root)
   ├─ handler ─────────▶ service ─────────▶ domain
   │                        ▲
   └─ repository/infra ─────┘  (service が定義した interface を実装する)
```

| 層 | 責務 | import してよいもの |
|---|---|---|
| `domain` | エンティティ、ロール、権限判定(Policy) | 標準ライブラリのみ |
| `service` | ユースケース。必要な port(interface)をここで定義する | `domain` |
| `handler` | gin による入出力変換。`service` を自パッケージ定義の interface 越しに利用 | `domain`、gin |
| `repository` | port の実装(`database/sql` + sqlc)。sqlc の型を外に出さず `domain` へ変換して返す | `domain`、`service` の port |
| `infra` | JWT、パスワードハッシュ、Clock など port の実装 | `domain`、`service` の port |
| `cmd/server` | 具体実装の生成と注入(組み立てはここだけ) | すべて |

ルール:
1. interface は使う側のパッケージで定義する(Go の慣習。`repository` 側に interface を置かない)。
2. `service` は `repository` / `infra` / `handler` / gin / `database/sql` / sqlc 生成コードを import しない。
3. `*gin.Context` は `handler` の外に渡さない。
4. 時刻・ハッシュ・JWT・ID 生成は port 経由。`service` から `time.Now()` やライブラリを直接呼ばない。
5. `init()`・グローバル変数・シングルトンで依存を保持しない。コンストラクタで注入する(interface を受け取り、具体型を返す)。
6. 権限チェックは `service`(domain の Policy)に集約する。
7. `service` のテストは fake を注入して DB なしで書く。`repository` のみ実 DB でテストする。
8. 上記の依存方向は `golangci-lint` の `depguard` で機械的に検査し、CI で失敗させる。

## 8. 開発ルール
- ブランチ戦略: `docs/development/branching-strategy.md`(Git Flow)
- PR: `docs/development/pull-request.md`

## 9. Docker化

開発・実行・テスト・コード生成をすべてコンテナ内で完結させ、ホストには Docker だけあれば動くようにする。

### 9.1 構成(`compose.yaml`)

| サービス | 役割 | ポート |
|---|---|---|
| `db` | PostgreSQL 17(named volume で永続化、healthcheck あり) | 5433(ホスト側。`.env` の `DB_PORT`。ローカルの 5432 と衝突しないよう既定を変更) |
| `migrate` | golang-migrate を実行して終了する one-shot(既定コマンドは `up`)。`db` が healthy になってから起動。`run --rm migrate down 1` のように引数だけ差し替えられる | - |
| `backend` | Gin API。開発時はホットリロード(air)。`migrate` の完了後に起動 | 8080 |
| `frontend` | Vite dev server。`/api` は backend へプロキシ | 5173 |
| `sqlc` | コード生成ツール。`tools` profile のため `up` では起動しない(`docker compose run --rm sqlc generate`) | - |

- `docker compose up` だけで、DB 起動 → マイグレーション → API/画面の起動まで通る。
- サービス間通信はコンテナ名(`db`、`backend`)で行う。
- リポジトリ全体を `/workspace` に bind mount する(`api/openapi.yaml` を Backend / Frontend の両方から参照するため)。`node_modules`、Go のモジュール/ビルドキャッシュは named volume に置く。
- コンテナ内ユーザーの UID/GID は `.env` の `HOST_UID` / `HOST_GID` で合わせ、生成ファイルが root 所有にならないようにする。

### 9.2 Dockerfile
- `backend/Dockerfile`、`frontend/Dockerfile` はマルチステージ。`dev` ターゲット(ソースを volume マウント)と `prod` ターゲット(Go は静的バイナリを distroless/alpine に、フロントは nginx で静的配信)を持つ。
- ルートの `.dockerignore` と各ディレクトリの `.dockerignore` で `.env`、`node_modules`、ビルド成果物を除外する。
- Backend は Go 1.25(gin / pgx の要求)。`prod` は distroless(約 18MB)、Frontend の `prod` は nginx(`/api` は `backend:8080` へプロキシ)。
- `dev` ターゲットの Frontend は、起動時に `package-lock.json` と `node_modules` を比較し、必要な場合だけ `npm ci` する。

### 9.3 設定と秘密情報
- 設定は環境変数で渡す。`.env.example` に必要なキー(`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `JWT_SECRET` / 各ポート / `HOST_UID` / `HOST_GID`)を列挙し、`.env` は Git 管理外(`make env` で作成)。`DATABASE_URL` は `compose.yaml` が `POSTGRES_*` から組み立てて Backend / migrate に渡す。
- 秘密情報をイメージや Dockerfile に焼き込まない。

### 9.4 コンテナ内で実行するコマンド
ホストに Go / Node / sqlc などを入れなくてよいよう、`Makefile` から `docker compose run --rm` 経由で実行する。

| 目的 | 例 |
|---|---|
| 起動 / 停止 | `make up` / `make down` |
| テスト | `make test`(個別: `docker compose run --rm backend go test ./...` / `docker compose run --rm frontend npm test`) |
| lint・型チェック | `make lint`(`go vet` / `golangci-lint`(depguard 含む) / `eslint` / `tsc`) |
| コード生成 | `make generate`(sqlc → oapi-codegen → openapi-typescript) |
| マイグレーション追加 | `docker compose run --rm migrate create -ext sql -dir /migrations -seq <name>` |
| マイグレーション適用 / 1つ戻す | `make migrate-up` / `make migrate-down` |
| prod イメージのビルド | `make build-prod` |

- oapi-codegen は `go.mod` の `tool` ディレクティブで固定し、`go tool oapi-codegen` で実行する。設定は `backend/oapi-codegen.yaml`。
- 生成物(`api.gen.go` / `schema.gen.ts` / `sqlcgen/`)はコミットし、CI で再生成の差分を検査する。

### 9.5 CI(GitHub Actions)
- 実行基盤は GitHub Actions。ローカルと環境差が出ないよう、同じ Dockerfile / compose でテストを実行する。
- トリガー: `develop` / `main` 向けの Pull Request と、それらへの push(ブランチ戦略に従う)。
- ワークフロー(`.github/workflows/`):

| ジョブ | 内容 |
|---|---|
| `backend` | `go vet`、`golangci-lint`(`depguard` による依存方向チェックを含む)、`go test ./...`(`db` サービスを使用) |
| `frontend` | `typecheck`、`lint`、`test`、`build` |
| `codegen-check` | sqlc / oapi-codegen / openapi-typescript を再実行し、生成物に差分が出ないことを確認(OpenAPI・SQL と生成コードのずれを防ぐ) |
| `docker-build` | `prod` ターゲットのイメージがビルドできることを確認 |

- CI の成功は PR マージの必須条件(`docs/development/pull-request.md` 参照)。

## 10. ディレクトリ構成

```
.
├── api/openapi.yaml
├── backend/
│   ├── Dockerfile
│   ├── cmd/server/         # composition root(main.go)
│   ├── internal/
│   │   ├── domain/        # エンティティ・ロール・Policy(依存なし)
│   │   ├── service/       # ユースケース + port(interface)定義
│   │   ├── handler/       # gin ハンドラ・ミドルウェア(openapi/ は生成コード)
│   │   ├── repository/    # sqlc を使った port 実装(sqlcgen/ は生成コード)
│   │   └── infra/         # JWT・ハッシュ・Clock などの port 実装
│   ├── db/{migrations,queries}/
│   ├── .golangci.yml      # depguard で依存方向を検査
│   ├── oapi-codegen.yaml
│   └── sqlc.yaml
├── frontend/
│   ├── Dockerfile
│   └── src/               # api/client.ts(JWT付与・401処理)、api/schema.gen.ts(生成)
├── compose.yaml
├── Makefile
├── .env.example
├── .github/workflows/
├── docs/{spec,development}/
└── .claude/{agents,skills,settings.json}
```

## 11. 実装状況
- 雛形は作成済み。`make up` で DB → マイグレーション(全テーブル作成)→ API / 画面が起動し、`GET /api/health`(DB 疎通確認つき)が Frontend のプロキシ経由でも応答する。
- `api/openapi.yaml` には現時点で `/api/health` のみ定義している。第4章のエンドポイントは `add-endpoint` Skill で OpenAPI から順に追加する。
- `domain` / `service` / `infra` はまだ実装なし(パッケージの責務のみ `doc.go` に記載)。

## 12. 未決事項
なし
