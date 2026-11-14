package repository

import (
	"context"
	"database/sql"

	"taskapp/backend/internal/domain"
	"taskapp/backend/internal/repository/sqlcgen"
	"taskapp/backend/internal/service"
)

var _ service.CommentRepository = (*CommentRepo)(nil)

type CommentRepo struct {
	q *sqlcgen.Queries
}

func NewCommentRepo(db *sql.DB) *CommentRepo { return &CommentRepo{q: sqlcgen.New(db)} }

func (r *CommentRepo) Create(ctx context.Context, taskID, userID int64, body string) (domain.Comment, error) {
	c, err := r.q.CreateComment(ctx, sqlcgen.CreateCommentParams{TaskID: taskID, UserID: userID, Body: body})
	if err != nil {
		return domain.Comment{}, mapErr(err)
	}
	return toComment(c), nil
}

func (r *CommentRepo) Get(ctx context.Context, id int64) (domain.Comment, error) {
	c, err := r.q.GetComment(ctx, id)
	if err != nil {
		return domain.Comment{}, mapErr(err)
	}
	return toComment(c), nil
}

func (r *CommentRepo) ListByTask(ctx context.Context, taskID int64) ([]domain.Comment, error) {
	rows, err := r.q.ListCommentsByTask(ctx, taskID)
	if err != nil {
		return nil, mapErr(err)
	}
	out := make([]domain.Comment, 0, len(rows))
	for _, c := range rows {
		out = append(out, toComment(c))
	}
	return out, nil
}

func (r *CommentRepo) UpdateBody(ctx context.Context, id int64, body string) (domain.Comment, error) {
	c, err := r.q.UpdateCommentBody(ctx, sqlcgen.UpdateCommentBodyParams{ID: id, Body: body})
	if err != nil {
		return domain.Comment{}, mapErr(err)
	}
	return toComment(c), nil
}

func (r *CommentRepo) Delete(ctx context.Context, id int64) error {
	return requireAffected(r.q.DeleteComment(ctx, id))
}

func toComment(c sqlcgen.Comment) domain.Comment {
	return domain.Comment{ID: c.ID, TaskID: c.TaskID, UserID: c.UserID, Body: c.Body, CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt}
}
