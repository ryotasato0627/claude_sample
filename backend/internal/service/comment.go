package service

import (
	"context"

	"taskapp/backend/internal/domain"
)

type CommentService struct {
	comments CommentRepository
	tasks    TaskGetter
	members  MembershipReader
}

func NewCommentService(comments CommentRepository, tasks TaskGetter, members MembershipReader) *CommentService {
	return &CommentService{comments: comments, tasks: tasks, members: members}
}

func (s *CommentService) List(ctx context.Context, actorID, taskID int64) ([]domain.Comment, error) {
	if _, err := s.authorizeTask(ctx, actorID, taskID, domain.ActionViewProject); err != nil {
		return nil, err
	}
	return s.comments.ListByTask(ctx, taskID)
}

func (s *CommentService) Create(ctx context.Context, actorID, taskID int64, body string) (domain.Comment, error) {
	if _, err := s.authorizeTask(ctx, actorID, taskID, domain.ActionCreateComment); err != nil {
		return domain.Comment{}, err
	}
	body, err := requiredText("body", body, maxCommentLen)
	if err != nil {
		return domain.Comment{}, err
	}
	return s.comments.Create(ctx, taskID, actorID, body)
}

// Update は owner は全件、member は自分のコメントのみ編集できる。
func (s *CommentService) Update(ctx context.Context, actorID, commentID int64, body string) (domain.Comment, error) {
	if _, err := s.authorizeModify(ctx, actorID, commentID); err != nil {
		return domain.Comment{}, err
	}
	body, err := requiredText("body", body, maxCommentLen)
	if err != nil {
		return domain.Comment{}, err
	}
	return s.comments.UpdateBody(ctx, commentID, body)
}

// Delete は owner は全件、member は自分のコメントのみ削除できる。
func (s *CommentService) Delete(ctx context.Context, actorID, commentID int64) error {
	if _, err := s.authorizeModify(ctx, actorID, commentID); err != nil {
		return err
	}
	return s.comments.Delete(ctx, commentID)
}

func (s *CommentService) authorizeTask(ctx context.Context, actorID, taskID int64, a domain.Action) (domain.Task, error) {
	t, err := s.tasks.Get(ctx, taskID)
	if err != nil {
		return domain.Task{}, err
	}
	if _, err := authorize(ctx, s.members, t.ProjectID, actorID, a); err != nil {
		return domain.Task{}, err
	}
	return t, nil
}

// authorizeModify は、コメントの編集・削除の権限を検証する。
// メンバーでなければ ErrNotFound、メンバーでも変更できなければ ErrForbidden。
func (s *CommentService) authorizeModify(ctx context.Context, actorID, commentID int64) (domain.Comment, error) {
	c, err := s.comments.Get(ctx, commentID)
	if err != nil {
		return domain.Comment{}, err
	}
	t, err := s.tasks.Get(ctx, c.TaskID)
	if err != nil {
		return domain.Comment{}, err
	}
	role, err := s.members.GetMemberRole(ctx, t.ProjectID, actorID)
	if err != nil {
		return domain.Comment{}, err
	}
	if !role.CanModifyComment(c.UserID, actorID) {
		return domain.Comment{}, domain.ErrForbidden
	}
	return c, nil
}
