package service

import (
	"context"
	"errors"

	"taskapp/backend/internal/domain"
)

type ProjectService struct {
	projects ProjectRepository
	users    UserRepository
}

func NewProjectService(projects ProjectRepository, users UserRepository) *ProjectService {
	return &ProjectService{projects: projects, users: users}
}

// Create はプロジェクトを作成し、作成者を owner にする。
func (s *ProjectService) Create(ctx context.Context, actorID int64, name, description string) (domain.ProjectWithRole, error) {
	name, err := requiredText("name", name, maxNameLen)
	if err != nil {
		return domain.ProjectWithRole{}, err
	}
	description, err = optionalText("description", description, maxProjectDescLen)
	if err != nil {
		return domain.ProjectWithRole{}, err
	}
	p, err := s.projects.CreateWithOwner(ctx, name, description, actorID)
	if err != nil {
		return domain.ProjectWithRole{}, err
	}
	return domain.ProjectWithRole{Project: p, Role: domain.RoleOwner}, nil
}

func (s *ProjectService) List(ctx context.Context, actorID int64) ([]domain.ProjectWithRole, error) {
	return s.projects.ListByUser(ctx, actorID)
}

func (s *ProjectService) Get(ctx context.Context, actorID, projectID int64) (domain.ProjectWithRole, error) {
	role, err := authorize(ctx, s.projects, projectID, actorID, domain.ActionViewProject)
	if err != nil {
		return domain.ProjectWithRole{}, err
	}
	p, err := s.projects.Get(ctx, projectID)
	if err != nil {
		return domain.ProjectWithRole{}, err
	}
	return domain.ProjectWithRole{Project: p, Role: role}, nil
}

// Update は指定された項目(nil でないもの)だけを更新する。更新は repository 側で項目単位に行う。
func (s *ProjectService) Update(ctx context.Context, actorID, projectID int64, name, description *string) (domain.ProjectWithRole, error) {
	role, err := authorize(ctx, s.projects, projectID, actorID, domain.ActionManageProject)
	if err != nil {
		return domain.ProjectWithRole{}, err
	}
	name, err = requiredTextPtr("name", name, maxNameLen)
	if err != nil {
		return domain.ProjectWithRole{}, err
	}
	description, err = optionalTextPtr("description", description, maxProjectDescLen)
	if err != nil {
		return domain.ProjectWithRole{}, err
	}
	p, err := s.projects.Update(ctx, projectID, name, description)
	if err != nil {
		return domain.ProjectWithRole{}, err
	}
	return domain.ProjectWithRole{Project: p, Role: role}, nil
}

func (s *ProjectService) Delete(ctx context.Context, actorID, projectID int64) error {
	if _, err := authorize(ctx, s.projects, projectID, actorID, domain.ActionManageProject); err != nil {
		return err
	}
	return s.projects.Delete(ctx, projectID)
}

func (s *ProjectService) ListMembers(ctx context.Context, actorID, projectID int64) ([]domain.Member, error) {
	if _, err := authorize(ctx, s.projects, projectID, actorID, domain.ActionViewProject); err != nil {
		return nil, err
	}
	return s.projects.ListMembers(ctx, projectID)
}

// AddMember は登録済みユーザーをメールアドレスで指定してメンバーに追加する。
func (s *ProjectService) AddMember(ctx context.Context, actorID, projectID int64, email, role string) (domain.Member, error) {
	if _, err := authorize(ctx, s.projects, projectID, actorID, domain.ActionManageProject); err != nil {
		return domain.Member{}, err
	}
	r, err := domain.ParseRole(role)
	if err != nil {
		return domain.Member{}, err
	}
	email, err = normalizeEmail(email)
	if err != nil {
		return domain.Member{}, err
	}
	user, err := s.users.GetByEmail(ctx, email)
	if errors.Is(err, domain.ErrNotFound) {
		return domain.Member{}, domain.Invalid("no registered user with that email")
	}
	if err != nil {
		return domain.Member{}, err
	}
	if err := s.projects.AddMember(ctx, projectID, user.ID, r); err != nil {
		return domain.Member{}, err
	}
	return domain.Member{UserID: user.ID, Email: user.Email, Name: user.Name, Role: r}, nil
}

// UpdateMemberRole はロールを変更する。最後の owner は降格できない。
func (s *ProjectService) UpdateMemberRole(ctx context.Context, actorID, projectID, targetUserID int64, role string) (domain.Member, error) {
	if _, err := authorize(ctx, s.projects, projectID, actorID, domain.ActionManageProject); err != nil {
		return domain.Member{}, err
	}
	r, err := domain.ParseRole(role)
	if err != nil {
		return domain.Member{}, err
	}
	target, err := s.projects.GetMember(ctx, projectID, targetUserID)
	if err != nil {
		return domain.Member{}, err
	}
	if target.Role == domain.RoleOwner && r != domain.RoleOwner {
		if err := s.ensureOtherOwnerExists(ctx, projectID); err != nil {
			return domain.Member{}, err
		}
	}
	if err := s.projects.UpdateMemberRole(ctx, projectID, targetUserID, r); err != nil {
		return domain.Member{}, err
	}
	target.Role = r
	return target, nil
}

// RemoveMember はメンバーを外す。最後の owner は外せない。
func (s *ProjectService) RemoveMember(ctx context.Context, actorID, projectID, targetUserID int64) error {
	if _, err := authorize(ctx, s.projects, projectID, actorID, domain.ActionManageProject); err != nil {
		return err
	}
	target, err := s.projects.GetMember(ctx, projectID, targetUserID)
	if err != nil {
		return err
	}
	if target.Role == domain.RoleOwner {
		if err := s.ensureOtherOwnerExists(ctx, projectID); err != nil {
			return err
		}
	}
	return s.projects.RemoveMember(ctx, projectID, targetUserID)
}

// ensureOtherOwnerExists は、対象の owner を除いても owner が残ることを確認する(早期エラー用)。
// 確認と更新は別々の操作のため、並行するリクエストに対する最終的な防衛線は repository 側にある
// (UpdateMemberRole / RemoveMember が owner の行をロックして、原子的に判定する)。
func (s *ProjectService) ensureOtherOwnerExists(ctx context.Context, projectID int64) error {
	n, err := s.projects.CountOwners(ctx, projectID)
	if err != nil {
		return err
	}
	if n <= 1 {
		return domain.ErrLastOwner
	}
	return nil
}
