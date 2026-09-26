package repository

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"taskapp/backend/internal/domain"
	"taskapp/backend/internal/repository/sqlcgen"
	"taskapp/backend/internal/service"
)

var _ service.TaskRepository = (*TaskRepo)(nil)

type TaskRepo struct {
	db *sql.DB
	q  *sqlcgen.Queries
}

func NewTaskRepo(db *sql.DB) *TaskRepo { return &TaskRepo{db: db, q: sqlcgen.New(db)} }

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

// UpdateContent は nil でない項目だけを更新する。
func (r *TaskRepo) UpdateContent(ctx context.Context, id int64, title, description *string) (domain.Task, error) {
	t, err := r.q.UpdateTaskContent(ctx, sqlcgen.UpdateTaskContentParams{ID: id, Title: nullString(title), Description: nullString(description)})
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

// UpdateAssignee は担当者を変更する(nil で解除)。担当者はそのプロジェクトのメンバーでなければならない。
// メンバーの行を FOR SHARE でロックしてから更新するので、確認と更新の間にそのメンバーが外されることはない
// (並行する RemoveMember は、このトランザクションが終わるまで待ち、その後で担当を解除する)。
func (r *TaskRepo) UpdateAssignee(ctx context.Context, id int64, assigneeID *int64) (domain.Task, error) {
	var updated sqlcgen.Task
	err := inTx(ctx, r.db, func(q *sqlcgen.Queries) error {
		current, err := q.GetTask(ctx, id)
		if err != nil {
			return err
		}
		if assigneeID != nil {
			_, err := q.LockProjectMember(ctx, sqlcgen.LockProjectMemberParams{ProjectID: current.ProjectID, UserID: *assigneeID})
			if errors.Is(err, sql.ErrNoRows) {
				return domain.Invalid("assignee must be a member of the project")
			}
			if err != nil {
				return err
			}
		}
		updated, err = q.UpdateTaskAssignee(ctx, sqlcgen.UpdateTaskAssigneeParams{ID: id, AssigneeID: nullInt64(assigneeID)})
		return err
	})
	if err != nil {
		return domain.Task{}, mapErr(err)
	}
	return toTask(updated), nil
}

func (r *TaskRepo) Delete(ctx context.Context, id int64) error {
	return requireAffected(r.q.DeleteTask(ctx, id))
}

// Search は f.UserID が所属するプロジェクトの Task のみを、更新日時の降順で返す。
func (r *TaskRepo) Search(ctx context.Context, f domain.TaskFilter) ([]domain.Task, int, error) {
	// DB の LIMIT / OFFSET は int32 で渡す。範囲外を黙って切り詰めないよう、変換前に検査する
	// (通常は service が検証済みなので、ここに来るのは呼び出し側のバグ)。
	if f.Limit < 1 || f.Limit > domain.MaxPageLimit || f.Offset < 0 || f.Offset > domain.MaxPageOffset {
		return nil, 0, domain.Invalid("limit or offset is out of range")
	}
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
