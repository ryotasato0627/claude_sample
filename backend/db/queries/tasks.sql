-- name: CreateTask :one
INSERT INTO tasks (project_id, title, description, created_by)
VALUES ($1, $2, $3, $4)
RETURNING id, project_id, title, description, status, assignee_id, created_by, created_at, updated_at;

-- name: GetTask :one
SELECT id, project_id, title, description, status, assignee_id, created_by, created_at, updated_at
FROM tasks
WHERE id = $1;

-- 指定された項目(NULL でないもの)だけを更新する。取得→上書きにすると、並行する別項目の更新を消してしまうため。
-- name: UpdateTaskContent :one
UPDATE tasks
SET title = COALESCE(sqlc.narg('title')::text, title),
    description = COALESCE(sqlc.narg('description')::text, description),
    updated_at = now()
WHERE id = @id
RETURNING id, project_id, title, description, status, assignee_id, created_by, created_at, updated_at;

-- name: UpdateTaskStatus :one
UPDATE tasks
SET status = $2, updated_at = now()
WHERE id = $1
RETURNING id, project_id, title, description, status, assignee_id, created_by, created_at, updated_at;

-- name: UpdateTaskAssignee :one
UPDATE tasks
SET assignee_id = $2, updated_at = now()
WHERE id = $1
RETURNING id, project_id, title, description, status, assignee_id, created_by, created_at, updated_at;

-- メンバーをプロジェクトから外すとき、そのプロジェクトで担当していた Task の担当者を解除する。
-- name: UnassignTasksInProject :exec
UPDATE tasks
SET assignee_id = NULL, updated_at = now()
WHERE project_id = $1 AND assignee_id = $2;

-- name: DeleteTask :execrows
DELETE FROM tasks WHERE id = $1;

-- 検索は「呼び出しユーザーが所属するプロジェクト」に JOIN で必ず絞る(権限の漏れを SQL 側でも防ぐ)。
-- q は呼び出し側で LIKE のメタ文字(\ % _)をエスケープして渡す。
-- name: SearchTasks :many
SELECT t.id, t.project_id, t.title, t.description, t.status, t.assignee_id, t.created_by, t.created_at, t.updated_at
FROM tasks t
JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = @user_id
WHERE (sqlc.narg('project_id')::bigint IS NULL OR t.project_id = sqlc.narg('project_id')::bigint)
  AND (sqlc.narg('status')::text IS NULL OR t.status = sqlc.narg('status')::text)
  AND (sqlc.narg('assignee_id')::bigint IS NULL OR t.assignee_id = sqlc.narg('assignee_id')::bigint)
  AND (
    sqlc.narg('q')::text IS NULL
    OR t.title ILIKE '%' || sqlc.narg('q')::text || '%' ESCAPE '\'
    OR t.description ILIKE '%' || sqlc.narg('q')::text || '%' ESCAPE '\'
  )
ORDER BY t.updated_at DESC, t.id DESC
LIMIT @page_limit OFFSET @page_offset;

-- name: CountSearchTasks :one
SELECT count(*)
FROM tasks t
JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = @user_id
WHERE (sqlc.narg('project_id')::bigint IS NULL OR t.project_id = sqlc.narg('project_id')::bigint)
  AND (sqlc.narg('status')::text IS NULL OR t.status = sqlc.narg('status')::text)
  AND (sqlc.narg('assignee_id')::bigint IS NULL OR t.assignee_id = sqlc.narg('assignee_id')::bigint)
  AND (
    sqlc.narg('q')::text IS NULL
    OR t.title ILIKE '%' || sqlc.narg('q')::text || '%' ESCAPE '\'
    OR t.description ILIKE '%' || sqlc.narg('q')::text || '%' ESCAPE '\'
  );
