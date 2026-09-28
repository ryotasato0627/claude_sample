---
paths:
  - "backend/db/**"
---

# マイグレーションと sqlc クエリ

データモデルは `docs/spec/requirements.md` 第5章が正。食い違う変更をする場合は要件書も更新する。

## マイグレーション(`backend/db/migrations/`)

- golang-migrate の **連番の up / down ペア** で追加する。down は必ず書く。
- **既存(適用済み)のマイグレーションは書き換えない。** 変更は新しいマイグレーションで行う。
- 1 マイグレーション = 1 つの目的。ファイル名は内容が分かる snake_case(例: `add_tasks_assignee_id`)。
- 破壊的変更(列削除・型変更・NOT NULL の追加)は既存データへの影響を確認する。必要ならデータ移行を含めるか、段階的に分ける。
- 外部キー・NOT NULL・UNIQUE・CHECK(例: `role` は owner / member / viewer、`status` は todo / in_progress / done)は DB 側でも制約する。
- 検索や外部キーで使うカラムにはインデックスを検討する。
- up → down → up が通ることを確認する。

## クエリ(`backend/db/queries/`)

- クエリを変えたら `docker compose run --rm sqlc generate` で再生成する。`sqlcgen/` は手で編集しない。
- 部分更新は項目単位で行い(`COALESCE` など)、別項目の同時更新が互いを消さないようにする。

手順は `add-migration` Skill を参照する。
