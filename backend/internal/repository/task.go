package repository

import (
	"context"
	"database/sql"
	"strings"

	"taskapp/backend/internal/domain"
	"taskapp/backend/internal/repository/sqlcgen"
	"taskapp/backend/internal/service"
)

var _ service.TaskRepository = (*TaskRepo)(nil)

type TaskRepo struct {
	q *sqlcgen.Queries
}

func NewTaskRepo(db *sql.DB) *TaskRepo { return &TaskRepo{q: sqlcgen.New(db)} }

func (r *TaskRepo) Create(ctx context.Context, projectID int64, title, description string, createdBy int64) (domain.Task, error) {
	t, err := r.q.CreateTask(ctx, sqlcgen.CreateTaskParams{ProjectID: projectID, Title: title, Description: description, CreatedBy: createdBy})
	if err != nil {
		return domain.Task{}, mapErr(err)
	}
	return toTask(t), nil
}

func (r *TaskRepo) Get(ctx context.Context, id int64) (domain.Task, error) {
	t, err := r.q.GetTask(ctx, id)
	if err != nil {
		return domain.Task{}, mapErr(err)
	}
	return toTask(t), nil
}

func (r *TaskRepo) UpdateContent(ctx context.Context, id int64, title, description string) (domain.Task, error) {
	t, err := r.q.UpdateTaskContent(ctx, sqlcgen.UpdateTaskContentParams{ID: id, Title: title, Description: description})
	if err != nil {
		return domain.Task{}, mapErr(err)
	}
	return toTask(t), nil
}

func (r *TaskRepo) UpdateStatus(ctx context.Context, id int64, status domain.TaskStatus) (domain.Task, error) {
	t, err := r.q.UpdateTaskStatus(ctx, sqlcgen.UpdateTaskStatusParams{ID: id, Status: string(status)})
	if err != nil {
		return domain.Task{}, mapErr(err)
	}
	return toTask(t), nil
}

func (r *TaskRepo) UpdateAssignee(ctx context.Context, id int64, assigneeID *int64) (domain.Task, error) {
	t, err := r.q.UpdateTaskAssignee(ctx, sqlcgen.UpdateTaskAssigneeParams{ID: id, AssigneeID: nullInt64(assigneeID)})
	if err != nil {
		return domain.Task{}, mapErr(err)
	}
	return toTask(t), nil
}

func (r *TaskRepo) Delete(ctx context.Context, id int64) error {
	return requireAffected(r.q.DeleteTask(ctx, id))
}

// Search は f.UserID が所属するプロジェクトの Task のみを、更新日時の降順で返す。
func (r *TaskRepo) Search(ctx context.Context, f domain.TaskFilter) ([]domain.Task, int, error) {
	var status *string
	if f.Status != nil {
		s := string(*f.Status)
		status = &s
	}
	var q *string
	if f.Query != "" {
		e := escapeLike(f.Query)
		q = &e
	}

	total, err := r.q.CountSearchTasks(ctx, sqlcgen.CountSearchTasksParams{
		UserID:     f.UserID,
		ProjectID:  nullInt64(f.ProjectID),
		Status:     nullString(status),
		AssigneeID: nullInt64(f.AssigneeID),
		Q:          nullString(q),
	})
	if err != nil {
		return nil, 0, mapErr(err)
	}
	rows, err := r.q.SearchTasks(ctx, sqlcgen.SearchTasksParams{
		UserID:     f.UserID,
		ProjectID:  nullInt64(f.ProjectID),
		Status:     nullString(status),
		AssigneeID: nullInt64(f.AssigneeID),
		Q:          nullString(q),
		PageLimit:  int32(f.Limit),
		PageOffset: int32(f.Offset),
	})
	if err != nil {
		return nil, 0, mapErr(err)
	}
	tasks := make([]domain.Task, 0, len(rows))
	for _, t := range rows {
		tasks = append(tasks, toTask(t))
	}
	return tasks, int(total), nil
}

// escapeLike は LIKE のメタ文字(\ % _)をエスケープし、ユーザー入力を「文字そのもの」の部分一致にする。
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func toTask(t sqlcgen.Task) domain.Task {
	var assignee *int64
	if t.AssigneeID.Valid {
		assignee = &t.AssigneeID.Int64
	}
	return domain.Task{
		ID: t.ID, ProjectID: t.ProjectID, Title: t.Title, Description: t.Description,
		Status: domain.TaskStatus(t.Status), AssigneeID: assignee, CreatedBy: t.CreatedBy,
		CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt,
	}
}

func nullInt64(v *int64) sql.NullInt64 {
	if v == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *v, Valid: true}
}

func nullString(v *string) sql.NullString {
	if v == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *v, Valid: true}
}
