-- name: CreateProject :one
INSERT INTO projects (name, description)
VALUES ($1, $2)
RETURNING id, name, description, created_at;

-- name: GetProject :one
SELECT id, name, description, created_at
FROM projects
WHERE id = $1;

-- 指定された項目(NULL でないもの)だけを更新する。取得→上書きにすると、並行する別項目の更新を消してしまうため。
-- name: UpdateProject :one
UPDATE projects
SET name = COALESCE(sqlc.narg('name')::text, name),
    description = COALESCE(sqlc.narg('description')::text, description)
WHERE id = @id
RETURNING id, name, description, created_at;

-- name: DeleteProject :execrows
DELETE FROM projects WHERE id = $1;

-- name: ListProjectsByUser :many
SELECT p.id, p.name, p.description, p.created_at, pm.role
FROM projects p
JOIN project_members pm ON pm.project_id = p.id
WHERE pm.user_id = $1
ORDER BY p.created_at DESC, p.id DESC;

-- name: AddProjectMember :exec
INSERT INTO project_members (project_id, user_id, role)
VALUES ($1, $2, $3);

-- name: GetProjectMemberRole :one
SELECT role
FROM project_members
WHERE project_id = $1 AND user_id = $2;

-- name: GetProjectMember :one
SELECT pm.user_id, u.email, u.name, pm.role
FROM project_members pm
JOIN users u ON u.id = pm.user_id
WHERE pm.project_id = $1 AND pm.user_id = $2;

-- name: ListProjectMembers :many
SELECT pm.user_id, u.email, u.name, pm.role
FROM project_members pm
JOIN users u ON u.id = pm.user_id
WHERE pm.project_id = $1
ORDER BY pm.user_id;

-- name: UpdateProjectMemberRole :execrows
UPDATE project_members
SET role = $3
WHERE project_id = $1 AND user_id = $2;

-- name: RemoveProjectMember :execrows
DELETE FROM project_members
WHERE project_id = $1 AND user_id = $2;

-- owner の降格・削除の判定用。owner の行をロックし、並行する別の降格・削除を待たせる
-- (ロック順を user_id 順に固定して、デッドロックを避ける)。
-- name: LockProjectOwners :many
SELECT user_id
FROM project_members
WHERE project_id = $1 AND role = 'owner'
ORDER BY user_id
FOR UPDATE;

-- 担当者にする前に、メンバーの行を共有ロックする。並行するメンバー削除は、この確認が終わるまで待つ。
-- name: LockProjectMember :one
SELECT user_id
FROM project_members
WHERE project_id = $1 AND user_id = $2
FOR SHARE;

-- name: CountProjectOwners :one
SELECT count(*)
FROM project_members
WHERE project_id = $1 AND role = 'owner';
