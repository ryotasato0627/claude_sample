package domain_test

import (
	"errors"
	"testing"

	"taskapp/backend/internal/domain"
)

// docs/spec/requirements.md 第2章の権限マトリクス。
func TestRoleCan(t *testing.T) {
	const (
		view    = domain.ActionViewProject
		manage  = domain.ActionManageProject
		write   = domain.ActionWriteTask
		del     = domain.ActionDeleteTask
		comment = domain.ActionCreateComment
	)
	tests := []struct {
		role   domain.Role
		action domain.Action
		want   bool
	}{
		{domain.RoleOwner, view, true}, {domain.RoleOwner, manage, true}, {domain.RoleOwner, write, true},
		{domain.RoleOwner, del, true}, {domain.RoleOwner, comment, true},

		{domain.RoleMember, view, true}, {domain.RoleMember, manage, false}, {domain.RoleMember, write, true},
		{domain.RoleMember, del, false}, {domain.RoleMember, comment, true},

		{domain.RoleViewer, view, true}, {domain.RoleViewer, manage, false}, {domain.RoleViewer, write, false},
		{domain.RoleViewer, del, false}, {domain.RoleViewer, comment, false},

		// 未知のロール・操作は、何も許可しない(安全側に倒す)
		{domain.Role(""), view, false}, {domain.Role("admin"), view, false}, {domain.Role("admin"), manage, false},
		{domain.RoleOwner, domain.Action(0), false}, {domain.RoleOwner, domain.Action(999), false},
	}
	for _, tt := range tests {
		if got := tt.role.Can(tt.action); got != tt.want {
			t.Errorf("Role(%q).Can(%d) = %v, want %v", tt.role, tt.action, got, tt.want)
		}
	}
}

func TestRoleCanModifyComment(t *testing.T) {
	const me, other = int64(1), int64(2)
	tests := []struct {
		role   domain.Role
		author int64
		want   bool
	}{
		{domain.RoleOwner, me, true}, {domain.RoleOwner, other, true}, // owner は全件
		{domain.RoleMember, me, true}, {domain.RoleMember, other, false}, // member は自分のみ
		{domain.RoleViewer, me, false}, {domain.RoleViewer, other, false}, // viewer は不可
		{domain.Role("admin"), me, false},
	}
	for _, tt := range tests {
		if got := tt.role.CanModifyComment(tt.author, me); got != tt.want {
			t.Errorf("Role(%q).CanModifyComment(author=%d, actor=%d) = %v, want %v", tt.role, tt.author, me, got, tt.want)
		}
	}
}

func TestParse(t *testing.T) {
	for _, s := range []string{"owner", "member", "viewer"} {
		if r, err := domain.ParseRole(s); err != nil || string(r) != s {
			t.Errorf("ParseRole(%q) = %q, %v", s, r, err)
		}
	}
	for _, s := range []string{"", "admin", "Owner", " owner"} {
		var ve *domain.ValidationError
		if _, err := domain.ParseRole(s); !errors.As(err, &ve) {
			t.Errorf("ParseRole(%q): err = %v, want ValidationError", s, err)
		}
	}
	for _, s := range []string{"todo", "in_progress", "done"} {
		if st, err := domain.ParseTaskStatus(s); err != nil || string(st) != s {
			t.Errorf("ParseTaskStatus(%q) = %q, %v", s, st, err)
		}
	}
	for _, s := range []string{"", "blocked", "DONE", "in-progress"} {
		var ve *domain.ValidationError
		if _, err := domain.ParseTaskStatus(s); !errors.As(err, &ve) {
			t.Errorf("ParseTaskStatus(%q): err = %v, want ValidationError", s, err)
		}
	}
}

func TestErrLastOwnerIsConflict(t *testing.T) {
	if !errors.Is(domain.ErrLastOwner, domain.ErrConflict) {
		t.Error("ErrLastOwner must be an ErrConflict")
	}
}
