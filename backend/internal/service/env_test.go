package service_test

import (
	"context"
	"testing"

	"taskapp/backend/internal/domain"
	"taskapp/backend/internal/service"
)

// env はテスト用のデータ一式。
//
//	project      : owner(owner) / member(member) / viewer(viewer) / target(viewer)
//	otherProject : outsider(owner)。project のメンバーとは無関係
//	newcomer     : 登録済みだがどのプロジェクトにも所属しない
type env struct {
	s        *store
	projects *service.ProjectService
	tasks    *service.TaskService
	comments *service.CommentService

	owner, member, viewer, target, outsider, newcomer int64

	project, otherProject       int64
	task, otherTask             int64
	memberComment, ownerComment int64
}

func newEnv(t *testing.T) *env {
	t.Helper()
	ctx := context.Background()
	s := newStore()
	users, projects, tasks, comments := fakeUsers{s}, fakeProjects{s}, fakeTasks{s}, fakeComments{s}

	e := &env{
		s:        s,
		projects: service.NewProjectService(projects, users),
		tasks:    service.NewTaskService(tasks, projects),
		comments: service.NewCommentService(comments, tasks, projects),
	}
	mustUser := func(email string) int64 {
		u, err := users.Create(ctx, email, email, "hash")
		if err != nil {
			t.Fatal(err)
		}
		return u.ID
	}
	e.owner, e.member, e.viewer = mustUser("owner@example.com"), mustUser("member@example.com"), mustUser("viewer@example.com")
	e.target, e.outsider, e.newcomer = mustUser("target@example.com"), mustUser("outsider@example.com"), mustUser("newcomer@example.com")

	p, err := projects.CreateWithOwner(ctx, "P", "", e.owner)
	if err != nil {
		t.Fatal(err)
	}
	e.project = p.ID
	for uid, role := range map[int64]domain.Role{e.member: domain.RoleMember, e.viewer: domain.RoleViewer, e.target: domain.RoleViewer} {
		if err := projects.AddMember(ctx, p.ID, uid, role); err != nil {
			t.Fatal(err)
		}
	}
	op, err := projects.CreateWithOwner(ctx, "Other", "", e.outsider)
	if err != nil {
		t.Fatal(err)
	}
	e.otherProject = op.ID

	tk, err := tasks.Create(ctx, e.project, "task", "", e.member)
	if err != nil {
		t.Fatal(err)
	}
	e.task = tk.ID
	otk, err := tasks.Create(ctx, e.otherProject, "other task", "", e.outsider)
	if err != nil {
		t.Fatal(err)
	}
	e.otherTask = otk.ID

	mc, err := comments.Create(ctx, e.task, e.member, "by member")
	if err != nil {
		t.Fatal(err)
	}
	oc, err := comments.Create(ctx, e.task, e.owner, "by owner")
	if err != nil {
		t.Fatal(err)
	}
	e.memberComment, e.ownerComment = mc.ID, oc.ID
	return e
}
