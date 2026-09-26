package repository

import (
	"context"
	"database/sql"
	"fmt"

	"taskapp/backend/internal/domain"
	"taskapp/backend/internal/repository/sqlcgen"
	"taskapp/backend/internal/service"
)

var _ service.ProjectRepository = (*ProjectRepo)(nil)

type ProjectRepo struct {
	db *sql.DB
	q  *sqlcgen.Queries
}

func NewProjectRepo(db *sql.DB) *ProjectRepo { return &ProjectRepo{db: db, q: sqlcgen.New(db)} }

// inTx は fn を 1 トランザクションで実行する。fn がエラーなら rollback する。
func inTx(ctx context.Context, db *sql.DB, fn func(q *sqlcgen.Queries) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	if err := fn(sqlcgen.New(tx)); err != nil {
		_ = tx.Rollback()
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

func (r *ProjectRepo) CreateWithOwner(ctx context.Context, name, description string, ownerID int64) (domain.Project, error) {
	var p sqlcgen.Project
	err := inTx(ctx, r.db, func(q *sqlcgen.Queries) error {
		var err error
		if p, err = q.CreateProject(ctx, sqlcgen.CreateProjectParams{Name: name, Description: description}); err != nil {
			return err
		}
		return q.AddProjectMember(ctx, sqlcgen.AddProjectMemberParams{ProjectID: p.ID, UserID: ownerID, Role: string(domain.RoleOwner)})
	})
	if err != nil {
		return domain.Project{}, mapErr(err)
	}
	return toProject(p), nil
}

func (r *ProjectRepo) Get(ctx context.Context, id int64) (domain.Project, error) {
	p, err := r.q.GetProject(ctx, id)
	if err != nil {
		return domain.Project{}, mapErr(err)
	}
	return toProject(p), nil
}

func (r *ProjectRepo) ListByUser(ctx context.Context, userID int64) ([]domain.ProjectWithRole, error) {
	rows, err := r.q.ListProjectsByUser(ctx, userID)
	if err != nil {
		return nil, mapErr(err)
	}
	out := make([]domain.ProjectWithRole, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.ProjectWithRole{
			Project: domain.Project{ID: row.ID, Name: row.Name, Description: row.Description, CreatedAt: row.CreatedAt},
			Role:    domain.Role(row.Role),
		})
	}
	return out, nil
}

func (r *ProjectRepo) Update(ctx context.Context, id int64, name, description string) (domain.Project, error) {
	p, err := r.q.UpdateProject(ctx, sqlcgen.UpdateProjectParams{ID: id, Name: name, Description: description})
	if err != nil {
		return domain.Project{}, mapErr(err)
	}
	return toProject(p), nil
}

func (r *ProjectRepo) Delete(ctx context.Context, id int64) error {
	return requireAffected(r.q.DeleteProject(ctx, id))
}

func (r *ProjectRepo) GetMemberRole(ctx context.Context, projectID, userID int64) (domain.Role, error) {
	role, err := r.q.GetProjectMemberRole(ctx, sqlcgen.GetProjectMemberRoleParams{ProjectID: projectID, UserID: userID})
	if err != nil {
		return "", mapErr(err)
	}
	return domain.Role(role), nil
}

func (r *ProjectRepo) GetMember(ctx context.Context, projectID, userID int64) (domain.Member, error) {
	m, err := r.q.GetProjectMember(ctx, sqlcgen.GetProjectMemberParams{ProjectID: projectID, UserID: userID})
	if err != nil {
		return domain.Member{}, mapErr(err)
	}
	return domain.Member{UserID: m.UserID, Email: m.Email, Name: m.Name, Role: domain.Role(m.Role)}, nil
}

func (r *ProjectRepo) ListMembers(ctx context.Context, projectID int64) ([]domain.Member, error) {
	rows, err := r.q.ListProjectMembers(ctx, projectID)
	if err != nil {
		return nil, mapErr(err)
	}
	out := make([]domain.Member, 0, len(rows))
	for _, m := range rows {
		out = append(out, domain.Member{UserID: m.UserID, Email: m.Email, Name: m.Name, Role: domain.Role(m.Role)})
	}
	return out, nil
}

func (r *ProjectRepo) AddMember(ctx context.Context, projectID, userID int64, role domain.Role) error {
	return mapErr(r.q.AddProjectMember(ctx, sqlcgen.AddProjectMemberParams{ProjectID: projectID, UserID: userID, Role: string(role)}))
}

func (r *ProjectRepo) UpdateMemberRole(ctx context.Context, projectID, userID int64, role domain.Role) error {
	return requireAffected(r.q.UpdateProjectMemberRole(ctx, sqlcgen.UpdateProjectMemberRoleParams{ProjectID: projectID, UserID: userID, Role: string(role)}))
}

// RemoveMember はメンバーを外し、同じトランザクションで、そのプロジェクトの担当を解除する。
func (r *ProjectRepo) RemoveMember(ctx context.Context, projectID, userID int64) error {
	return inTx(ctx, r.db, func(q *sqlcgen.Queries) error {
		if err := requireAffected(q.RemoveProjectMember(ctx, sqlcgen.RemoveProjectMemberParams{ProjectID: projectID, UserID: userID})); err != nil {
			return err
		}
		return mapErr(q.UnassignTasksInProject(ctx, sqlcgen.UnassignTasksInProjectParams{
			ProjectID:  projectID,
			AssigneeID: sql.NullInt64{Int64: userID, Valid: true},
		}))
	})
}

func (r *ProjectRepo) CountOwners(ctx context.Context, projectID int64) (int, error) {
	n, err := r.q.CountProjectOwners(ctx, projectID)
	if err != nil {
		return 0, mapErr(err)
	}
	return int(n), nil
}

func toProject(p sqlcgen.Project) domain.Project {
	return domain.Project{ID: p.ID, Name: p.Name, Description: p.Description, CreatedAt: p.CreatedAt}
}
