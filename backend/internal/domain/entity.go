package domain

import "time"

type User struct {
	ID           int64
	Email        string
	Name         string
	PasswordHash string
	CreatedAt    time.Time
}

type Project struct {
	ID          int64
	Name        string
	Description string
	CreatedAt   time.Time
}

// ProjectWithRole は、呼び出したユーザーのロールつきのプロジェクト。
type ProjectWithRole struct {
	Project
	Role Role
}

// Member はプロジェクトのメンバー。
type Member struct {
	UserID int64
	Email  string
	Name   string
	Role   Role
}

type TaskStatus string

const (
	StatusTodo       TaskStatus = "todo"
	StatusInProgress TaskStatus = "in_progress"
	StatusDone       TaskStatus = "done"
)

// ParseTaskStatus は文字列を TaskStatus に変換する。不正な値は ValidationError。
func ParseTaskStatus(s string) (TaskStatus, error) {
	st := TaskStatus(s)
	switch st {
	case StatusTodo, StatusInProgress, StatusDone:
		return st, nil
	default:
		return "", Invalid("status must be one of todo, in_progress, done")
	}
}

type Task struct {
	ID          int64
	ProjectID   int64
	Title       string
	Description string
	Status      TaskStatus
	AssigneeID  *int64
	CreatedBy   int64
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// Task 検索のページサイズ。
const (
	DefaultPageLimit = 20
	MaxPageLimit     = 100
)

// TaskFilter は Task 検索の条件。UserID が所属するプロジェクトの Task のみが対象になる。
type TaskFilter struct {
	UserID     int64
	ProjectID  *int64
	Status     *TaskStatus
	AssigneeID *int64
	Query      string // タイトル・説明の部分一致。空なら条件なし
	Limit      int
	Offset     int
}

type Comment struct {
	ID        int64
	TaskID    int64
	UserID    int64
	Body      string
	CreatedAt time.Time
	UpdatedAt time.Time
}
