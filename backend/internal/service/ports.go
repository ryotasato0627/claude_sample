// Package service はユースケースを置く。
// 必要な port(interface)はこのパッケージで定義し、repository / infra がそれを実装する。
// repository / infra / handler / gin / database/sql を import しない(depguard で検査)。
//
// 権限チェックはこのパッケージ(domain の Policy)で行う。
// プロジェクトのメンバーではないユーザーには、リソースの存在を知らせないため ErrNotFound を返す。
package service

import (
	"context"
	"time"

	"taskapp/backend/internal/domain"
)

// ---- repository ports(実装は internal/repository) ----
//
// 見つからない場合は domain.ErrNotFound、一意制約違反などは domain.ErrConflict を返すこと。

type UserRepository interface {
	// Create は email が重複していれば domain.ErrConflict を返す。
	Create(ctx context.Context, email, name, passwordHash string) (domain.User, error)
	GetByEmail(ctx context.Context, email string) (domain.User, error)
}

// MembershipReader はユーザーのプロジェクト内ロールを返す。メンバーでなければ domain.ErrNotFound。
type MembershipReader interface {
	GetMemberRole(ctx context.Context, projectID, userID int64) (domain.Role, error)
}

type ProjectRepository interface {
	MembershipReader

	// CreateWithOwner はプロジェクトの作成と、作成者の owner 登録を 1 トランザクションで行う。
	CreateWithOwner(ctx context.Context, name, description string, ownerID int64) (domain.Project, error)
	Get(ctx context.Context, id int64) (domain.Project, error)
	ListByUser(ctx context.Context, userID int64) ([]domain.ProjectWithRole, error)
	Update(ctx context.Context, id int64, name, description string) (domain.Project, error)
	Delete(ctx context.Context, id int64) error

	GetMember(ctx context.Context, projectID, userID int64) (domain.Member, error)
	ListMembers(ctx context.Context, projectID int64) ([]domain.Member, error)
	// AddMember は既にメンバーであれば domain.ErrConflict を返す。
	AddMember(ctx context.Context, projectID, userID int64, role domain.Role) error
	UpdateMemberRole(ctx context.Context, projectID, userID int64, role domain.Role) error
	// RemoveMember はメンバーを外し、そのプロジェクトで担当していた Task の担当者を解除する。
	RemoveMember(ctx context.Context, projectID, userID int64) error
	CountOwners(ctx context.Context, projectID int64) (int, error)
}

type TaskGetter interface {
	Get(ctx context.Context, id int64) (domain.Task, error)
}

type TaskRepository interface {
	TaskGetter

	Create(ctx context.Context, projectID int64, title, description string, createdBy int64) (domain.Task, error)
	UpdateContent(ctx context.Context, id int64, title, description string) (domain.Task, error)
	UpdateStatus(ctx context.Context, id int64, status domain.TaskStatus) (domain.Task, error)
	UpdateAssignee(ctx context.Context, id int64, assigneeID *int64) (domain.Task, error)
	Delete(ctx context.Context, id int64) error
	// Search は f.UserID が所属するプロジェクトの Task のみを、更新日時の降順で返す。
	// 戻り値の int は、ページネーション前の総件数。
	Search(ctx context.Context, f domain.TaskFilter) ([]domain.Task, int, error)
}

type CommentRepository interface {
	Create(ctx context.Context, taskID, userID int64, body string) (domain.Comment, error)
	Get(ctx context.Context, id int64) (domain.Comment, error)
	ListByTask(ctx context.Context, taskID int64) ([]domain.Comment, error)
	UpdateBody(ctx context.Context, id int64, body string) (domain.Comment, error)
	Delete(ctx context.Context, id int64) error
}

// ---- infra ports(実装は internal/infra) ----

type PasswordHasher interface {
	Hash(plain string) (string, error)
	// Compare は一致しなければエラーを返す。
	Compare(hash, plain string) error
}

type TokenIssuer interface {
	Issue(userID int64) (token string, expiresAt time.Time, err error)
}

type TokenVerifier interface {
	Verify(token string) (userID int64, err error)
}

// authorize は、actor のロールが action を許可するかを検証してロールを返す。
// メンバーでなければ ErrNotFound、権限がなければ ErrForbidden。
func authorize(ctx context.Context, m MembershipReader, projectID, actorID int64, a domain.Action) (domain.Role, error) {
	role, err := m.GetMemberRole(ctx, projectID, actorID)
	if err != nil {
		return "", err
	}
	if !role.Can(a) {
		return "", domain.ErrForbidden
	}
	return role, nil
}
