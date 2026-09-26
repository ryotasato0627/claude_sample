-- name: CreateComment :one
INSERT INTO comments (task_id, user_id, body)
VALUES ($1, $2, $3)
RETURNING id, task_id, user_id, body, created_at, updated_at;

-- name: GetComment :one
SELECT id, task_id, user_id, body, created_at, updated_at
FROM comments
WHERE id = $1;

-- name: ListCommentsByTask :many
SELECT id, task_id, user_id, body, created_at, updated_at
FROM comments
WHERE task_id = $1
ORDER BY created_at, id;

-- name: UpdateCommentBody :one
UPDATE comments
SET body = $2, updated_at = now()
WHERE id = $1
RETURNING id, task_id, user_id, body, created_at, updated_at;

-- name: DeleteComment :execrows
DELETE FROM comments WHERE id = $1;
