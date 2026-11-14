package handler

import (
	"context"
	"time"

	"taskapp/backend/internal/domain"
)

// このファイルの interface は、handler が必要とする service の振る舞い(使う側で定義した port)。
// 実装は service パッケージにあり、cmd/server で注入する。handler は service を import しない。

// Pinger は疎通確認に必要な最小限の依存。*sql.DB などが満たす。
type Pinger interface {
	PingContext(ctx context.Context) error
}

// Authenticator はトークンからユーザー ID を得る。不正なら domain.ErrUnauthorized。
type Authenticator interface {
	Authenticate(ctx context.Context, token string) (int64, error)
}

type AuthService interface {
	Authenticator
	Register(ctx context.Context, email, name, password string) (domain.User, error)
	Login(ctx context.Context, email, password string) (user domain.User, token string, expiresAt time.Time, err error)
}

type ProjectService interface {
	Create(ctx context.Context, actorID int64, name, description string) (domain.ProjectWithRole, error)
	List(ctx context.Context, actorID int64) ([]domain.ProjectWithRole, error)
	Get(ctx context.Context, actorID, projectID int64) (domain.ProjectWithRole, error)
	Update(ctx context.Context, actorID, projectID int64, name, description *string) (domain.ProjectWithRole, error)
	Delete(ctx context.Context, actorID, projectID int64) error

	ListMembers(ctx context.Context, actorID, projectID int64) ([]domain.Member, error)
	AddMember(ctx context.Context, actorID, projectID int64, email, role string) (domain.Member, error)
	UpdateMemberRole(ctx context.Context, actorID, projectID, targetUserID int64, role string) (domain.Member, error)
	RemoveMember(ctx context.Context, actorID, projectID, targetUserID int64) error
}

type TaskService interface {
	Create(ctx context.Context, actorID, projectID int64, title string, description *string) (domain.Task, error)
	Get(ctx context.Context, actorID, taskID int64) (domain.Task, error)
	Update(ctx context.Context, actorID, taskID int64, title, description *string) (domain.Task, error)
	UpdateStatus(ctx context.Context, actorID, taskID int64, status string) (domain.Task, error)
	UpdateAssignee(ctx context.Context, actorID, taskID int64, assigneeID *int64) (domain.Task, error)
	Delete(ctx context.Context, actorID, taskID int64) error
	ListByProject(ctx context.Context, actorID, projectID int64, f domain.TaskFilter) ([]domain.Task, int, error)
	Search(ctx context.Context, actorID int64, f domain.TaskFilter) ([]domain.Task, int, error)
}

type CommentService interface {
	List(ctx context.Context, actorID, taskID int64) ([]domain.Comment, error)
	Create(ctx context.Context, actorID, taskID int64, body string) (domain.Comment, error)
	Update(ctx context.Context, actorID, commentID int64, body string) (domain.Comment, error)
	Delete(ctx context.Context, actorID, commentID int64) error
}

// Deps は Handler が必要とする依存の一式。
type Deps struct {
	DB       Pinger
	Auth     AuthService
	Projects ProjectService
	Tasks    TaskService
	Comments CommentService
}
