---
name: add-migration
description: golang-migrate によるDBマイグレーションの追加規約と手順。テーブル・カラム・インデックスの追加や変更、sqlcクエリへの反映を行うときに使う。
---

# Add Migration Skill

## Purpose

スキーマ変更を、安全に(既存マイグレーションを壊さず)追加し、sqlc とデータモデルへ反映する。
データモデルは `docs/spec/requirements.md` 第5章を参照する。

## Rules

* マイグレーションは `backend/db/migrations/` に **連番の up / down ペア**で追加する
* **既存(適用済み)マイグレーションは書き換えない。** 変更は新しいマイグレーションで行う
* 1 マイグレーション = 1 つの目的。小さく保つ
* **down は必ず書く**(up を元に戻せること)
* 破壊的変更(列削除・型変更・NOT NULL 追加)は、既存データへの影響を確認する。必要ならデータ移行を含める、または段階的に分ける
* 外部キー・NOT NULL・UNIQUE・CHECK(例: `role` は owner/member/viewer、`status` は todo/in_progress/done)は DB 側でも制約する
* 検索や外部キーで使うカラムにはインデックスを検討する
* 秘密情報や環境依存の値を書かない

## Steps

### 1. 変更内容を決める

* 要件書の第5章(データモデル)と食い違わないか確認する。食い違う場合は要件書も更新する

### 2. マイグレーションを作成する

```bash
docker compose run --rm migrate create -ext sql -dir /migrations -seq <name>
```

`<name>` は内容が分かる snake_case(例: `create_projects`、`add_tasks_assignee_id`)。
生成された `NNNNNN_<name>.up.sql` / `.down.sql` を編集する。

### 3. 適用して確認する(up → down → up)

```bash
docker compose run --rm migrate up
docker compose run --rm migrate down 1
docker compose run --rm migrate up
```

up / down / up が通ることを確認する。

### 4. sqlc に反映する

* 必要なら `backend/db/queries/*.sql` にクエリを追加・修正する
* 生成する(生成物は手編集しない)

```bash
docker compose run --rm sqlc generate
```

* 生成された型は `repository` 層の外に出さない(`domain` へ変換して返す)。詳細は `add-endpoint` Skill

### 5. テストを実行する

```bash
docker compose run --rm backend go test ./...
```

## Checklist

- [ ] 連番の up / down ペアを追加した
- [ ] 既存マイグレーションを変更していない
- [ ] up → down → up が通る
- [ ] 制約(FK / NOT NULL / UNIQUE / CHECK)とインデックスを検討した
- [ ] 既存データへの影響を確認した(破壊的変更の場合)
- [ ] sqlc を再生成し、生成物を手編集していない
- [ ] 要件書の第5章と整合している
