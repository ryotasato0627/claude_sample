package service

import (
	"context"
	"errors"

	"taskapp/backend/internal/domain"
)

type TaskService struct {
	tasks   TaskRepository
	members MembershipReader
}

func NewTaskService(tasks TaskRepository, members MembershipReader) *TaskService {
	return &TaskService{tasks: tasks, members: members}
}

func (s *TaskService) Create(ctx context.Context, actorID, projectID int64, title string, description *string) (domain.Task, error) {
	if _, err := authorize(ctx, s.members, projectID, actorID, domain.ActionWriteTask); err != nil {
		return domain.Task{}, err
	}
	title, err := requiredText("title", title, maxTaskTitleLen)
	if err != nil {
		return domain.Task{}, err
	}
	desc := ""
	if description != nil {
		if desc, err = optionalText("description", *description, maxTaskDescLen); err != nil {
			return domain.Task{}, err
		}
	}
	return s.tasks.Create(ctx, projectID, title, desc, actorID)
}

func (s *TaskService) Get(ctx context.Context, actorID, taskID int64) (domain.Task, error) {
	return s.load(ctx, actorID, taskID, domain.ActionViewProject)
}

// Update は指定された項目(nil でないもの)だけを更新する。
func (s *TaskService) Update(ctx context.Context, actorID, taskID int64, title, description *string) (domain.Task, error) {
	t, err := s.load(ctx, actorID, taskID, domain.ActionWriteTask)
	if err != nil {
		return domain.Task{}, err
	}
	if title != nil {
		if t.Title, err = requiredText("title", *title, maxTaskTitleLen); err != nil {
			return domain.Task{}, err
		}
	}
	if description != nil {
		if t.Description, err = optionalText("description", *description, maxTaskDescLen); err != nil {
			return domain.Task{}, err
		}
	}
	return s.tasks.UpdateContent(ctx, taskID, t.Title, t.Description)
}

func (s *TaskService) UpdateStatus(ctx context.Context, actorID, taskID int64, status string) (domain.Task, error) {
	if _, err := s.load(ctx, actorID, taskID, domain.ActionWriteTask); err != nil {
		return domain.Task{}, err
	}
	st, err := domain.ParseTaskStatus(status)
	if err != nil {
		return domain.Task{}, err
	}
	return s.tasks.UpdateStatus(ctx, taskID, st)
}

// UpdateAssignee は担当者を変更する。assigneeID が nil なら解除。担当者はそのプロジェクトのメンバーのみ。
func (s *TaskService) UpdateAssignee(ctx context.Context, actorID, taskID int64, assigneeID *int64) (domain.Task, error) {
	t, err := s.load(ctx, actorID, taskID, domain.ActionWriteTask)
	if err != nil {
		return domain.Task{}, err
	}
	if assigneeID != nil {
		_, err := s.members.GetMemberRole(ctx, t.ProjectID, *assigneeID)
		if errors.Is(err, domain.ErrNotFound) {
			return domain.Task{}, domain.Invalid("assignee must be a member of the project")
		}
		if err != nil {
			return domain.Task{}, err
		}
	}
	return s.tasks.UpdateAssignee(ctx, taskID, assigneeID)
}

func (s *TaskService) Delete(ctx context.Context, actorID, taskID int64) error {
	if _, err := s.load(ctx, actorID, taskID, domain.ActionDeleteTask); err != nil {
		return err
	}
	return s.tasks.Delete(ctx, taskID)
}

// ListByProject はプロジェクト内の Task を返す。f.UserID / f.ProjectID は無視して上書きする。
func (s *TaskService) ListByProject(ctx context.Context, actorID, projectID int64, f domain.TaskFilter) ([]domain.Task, int, error) {
	if _, err := authorize(ctx, s.members, projectID, actorID, domain.ActionViewProject); err != nil {
		return nil, 0, err
	}
	f.ProjectID = &projectID
	return s.search(ctx, actorID, f)
}

// Search は actorID が所属するプロジェクトの Task を検索する。f.UserID は無視して上書きする。
func (s *TaskService) Search(ctx context.Context, actorID int64, f domain.TaskFilter) ([]domain.Task, int, error) {
	return s.search(ctx, actorID, f)
}

func (s *TaskService) search(ctx context.Context, actorID int64, f domain.TaskFilter) ([]domain.Task, int, error) {
	f.UserID = actorID
	if f.Status != nil {
		st, err := domain.ParseTaskStatus(string(*f.Status))
		if err != nil {
			return nil, 0, err
		}
		f.Status = &st
	}
	if f.Limit == 0 {
		f.Limit = domain.DefaultPageLimit
	}
	if f.Limit < 1 || f.Limit > domain.MaxPageLimit {
		return nil, 0, domain.Invalid("limit must be between 1 and %d", domain.MaxPageLimit)
	}
	if f.Offset < 0 {
		return nil, 0, domain.Invalid("offset must be 0 or greater")
	}
	q, err := optionalText("q", f.Query, maxQueryLen)
	if err != nil {
		return nil, 0, err
	}
	f.Query = q
	return s.tasks.Search(ctx, f)
}

// load は Task を取得し、そのプロジェクトで actor が action を実行できることを検証する。
func (s *TaskService) load(ctx context.Context, actorID, taskID int64, a domain.Action) (domain.Task, error) {
	t, err := s.tasks.Get(ctx, taskID)
	if err != nil {
		return domain.Task{}, err
	}
	if _, err := authorize(ctx, s.members, t.ProjectID, actorID, a); err != nil {
		return domain.Task{}, err
	}
	return t, nil
}
