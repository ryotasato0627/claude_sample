// Package domain はエンティティ・ロール・権限判定(Policy)を置く。
// 標準ライブラリ以外に依存しない(.golangci.yml の depguard で検査)。
package domain

// Role はプロジェクト内でのユーザーの役割。
type Role string

const (
	RoleOwner  Role = "owner"
	RoleMember Role = "member"
	RoleViewer Role = "viewer"
)

// ParseRole は文字列を Role に変換する。不正な値は ValidationError。
func ParseRole(s string) (Role, error) {
	r := Role(s)
	switch r {
	case RoleOwner, RoleMember, RoleViewer:
		return r, nil
	default:
		return "", Invalid("role must be one of owner, member, viewer")
	}
}

// Action はロールに対して許可を判定する操作。
type Action int

const (
	// ActionViewProject はプロジェクト・Task・コメントの閲覧と Task 検索。
	ActionViewProject Action = iota + 1
	// ActionManageProject はプロジェクトの編集・削除、メンバーの追加・ロール変更・削除。
	ActionManageProject
	// ActionWriteTask は Task の作成・編集・ステータス変更・担当者変更。
	ActionWriteTask
	// ActionDeleteTask は Task の削除。
	ActionDeleteTask
	// ActionCreateComment はコメントの投稿。
	ActionCreateComment
)

// Can は、このロールが操作を実行できるかを返す(docs/spec/requirements.md 第2章の権限マトリクス)。
func (r Role) Can(a Action) bool {
	switch a {
	case ActionViewProject:
		return r == RoleOwner || r == RoleMember || r == RoleViewer
	case ActionWriteTask, ActionCreateComment:
		return r == RoleOwner || r == RoleMember
	case ActionManageProject, ActionDeleteTask:
		return r == RoleOwner
	default:
		return false
	}
}

// CanModifyComment は、コメントの編集・削除ができるかを返す。
// owner は全件、member は自分のコメントのみ、viewer は不可。
func (r Role) CanModifyComment(authorID, actorID int64) bool {
	switch r {
	case RoleOwner:
		return true
	case RoleMember:
		return authorID == actorID
	default:
		return false
	}
}
