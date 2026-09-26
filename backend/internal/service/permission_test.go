package service_test

import (
	"context"
	"errors"
	"testing"

	"taskapp/backend/internal/domain"
)

// 権限マトリクス(docs/spec/requirements.md 第2章)を「操作 × ロール」で検証する。
// 期待値は仕様から起こしたもので、実装の Role.Can は参照しない。
//
//	nil          : 成功
//	ErrForbidden : メンバーだが権限がない(403)
//	ErrNotFound  : メンバーではない(リソースの存在も知らせない。404)

type operation struct {
	name string
	run  func(e *env, actor int64) error
	// 期待結果: owner, member, viewer, outsider(非メンバー)の順
	owner, member, viewer, outsider error
}

var (
	ok        error
	forbidden = domain.ErrForbidden
	notFound  = domain.ErrNotFound
)

func str(s string) *string { return &s }

func operations() []operation {
	ctx := context.Background()
	return []operation{
		{"プロジェクト閲覧", func(e *env, a int64) error { _, err := e.projects.Get(ctx, a, e.project); return err }, ok, ok, ok, notFound},
		{"プロジェクト更新", func(e *env, a int64) error {
			_, err := e.projects.Update(ctx, a, e.project, str("new"), nil)
			return err
		}, ok, forbidden, forbidden, notFound},
		{"プロジェクト削除", func(e *env, a int64) error { return e.projects.Delete(ctx, a, e.project) }, ok, forbidden, forbidden, notFound},
		{"メンバー一覧", func(e *env, a int64) error { _, err := e.projects.ListMembers(ctx, a, e.project); return err }, ok, ok, ok, notFound},
		{"メンバー追加", func(e *env, a int64) error {
			_, err := e.projects.AddMember(ctx, a, e.project, "newcomer@example.com", "member")
			return err
		}, ok, forbidden, forbidden, notFound},
		{"ロール変更", func(e *env, a int64) error {
			_, err := e.projects.UpdateMemberRole(ctx, a, e.project, e.target, "member")
			return err
		}, ok, forbidden, forbidden, notFound},
		{"メンバー削除", func(e *env, a int64) error { return e.projects.RemoveMember(ctx, a, e.project, e.target) }, ok, forbidden, forbidden, notFound},

		{"Task一覧", func(e *env, a int64) error {
			_, _, err := e.tasks.ListByProject(ctx, a, e.project, domain.TaskFilter{})
			return err
		}, ok, ok, ok, notFound},
		{"Task作成", func(e *env, a int64) error { _, err := e.tasks.Create(ctx, a, e.project, "new", nil); return err }, ok, ok, forbidden, notFound},
		{"Task閲覧", func(e *env, a int64) error { _, err := e.tasks.Get(ctx, a, e.task); return err }, ok, ok, ok, notFound},
		{"Task編集", func(e *env, a int64) error { _, err := e.tasks.Update(ctx, a, e.task, str("new"), nil); return err }, ok, ok, forbidden, notFound},
		{"ステータス変更", func(e *env, a int64) error { _, err := e.tasks.UpdateStatus(ctx, a, e.task, "done"); return err }, ok, ok, forbidden, notFound},
		{"担当者変更", func(e *env, a int64) error {
			id := e.member
			_, err := e.tasks.UpdateAssignee(ctx, a, e.task, &id)
			return err
		}, ok, ok, forbidden, notFound},
		{"Task削除", func(e *env, a int64) error { return e.tasks.Delete(ctx, a, e.task) }, ok, forbidden, forbidden, notFound},

		{"コメント一覧", func(e *env, a int64) error { _, err := e.comments.List(ctx, a, e.task); return err }, ok, ok, ok, notFound},
		{"コメント投稿", func(e *env, a int64) error { _, err := e.comments.Create(ctx, a, e.task, "hi"); return err }, ok, ok, forbidden, notFound},
	}
}

func TestPermissionMatrix(t *testing.T) {
	for _, op := range operations() {
		actors := []struct {
			role string
			id   func(*env) int64
			want error
		}{
			{"owner", func(e *env) int64 { return e.owner }, op.owner},
			{"member", func(e *env) int64 { return e.member }, op.member},
			{"viewer", func(e *env) int64 { return e.viewer }, op.viewer},
			{"非メンバー", func(e *env) int64 { return e.outsider }, op.outsider},
		}
		for _, a := range actors {
			t.Run(op.name+"/"+a.role, func(t *testing.T) {
				e := newEnv(t)
				assertErr(t, op.run(e, a.id(e)), a.want)
			})
		}
	}
}

func TestCommentModifyPermission(t *testing.T) {
	ctx := context.Background()
	type actor struct {
		name string
		id   func(*env) int64
	}
	owner := actor{"owner", func(e *env) int64 { return e.owner }}
	member := actor{"member", func(e *env) int64 { return e.member }}
	viewer := actor{"viewer", func(e *env) int64 { return e.viewer }}
	outsider := actor{"非メンバー", func(e *env) int64 { return e.outsider }}

	// target: "member" = member が投稿したコメント、"owner" = owner が投稿したコメント
	tests := []struct {
		actor   actor
		target  string
		wantErr error
	}{
		{owner, "member", ok}, // owner は全件
		{owner, "owner", ok},
		{member, "member", ok}, // member は自分のコメントのみ
		{member, "owner", forbidden},
		{viewer, "member", forbidden}, // viewer は不可
		{viewer, "owner", forbidden},
		{outsider, "member", notFound},
		{outsider, "owner", notFound},
	}
	for _, tt := range tests {
		commentID := func(e *env) int64 {
			if tt.target == "member" {
				return e.memberComment
			}
			return e.ownerComment
		}
		t.Run("編集/"+tt.actor.name+"→"+tt.target+"のコメント", func(t *testing.T) {
			e := newEnv(t)
			c, err := e.comments.Update(ctx, tt.actor.id(e), commentID(e), "edited")
			assertErr(t, err, tt.wantErr)
			if tt.wantErr == nil && c.Body != "edited" {
				t.Errorf("body = %q, want edited", c.Body)
			}
			if tt.wantErr != nil && e.s.comments[commentID(e)].Body == "edited" {
				t.Error("comment must not be modified on error")
			}
		})
		t.Run("削除/"+tt.actor.name+"→"+tt.target+"のコメント", func(t *testing.T) {
			e := newEnv(t)
			assertErr(t, e.comments.Delete(ctx, tt.actor.id(e), commentID(e)), tt.wantErr)
			_, exists := e.s.comments[commentID(e)]
			if tt.wantErr != nil && !exists {
				t.Error("comment must not be deleted on error")
			}
			if tt.wantErr == nil && exists {
				t.Error("comment must be deleted")
			}
		})
	}
}

// 他プロジェクトのリソースを、ID を指定して操作できないこと(IDOR 対策)。
func TestCannotAccessOtherProjectsResources(t *testing.T) {
	ctx := context.Background()

	ops := map[string]func(e *env) error{
		"Task閲覧":   func(e *env) error { _, err := e.tasks.Get(ctx, e.owner, e.otherTask); return err },
		"Task編集":   func(e *env) error { _, err := e.tasks.Update(ctx, e.owner, e.otherTask, str("x"), nil); return err },
		"ステータス変更":  func(e *env) error { _, err := e.tasks.UpdateStatus(ctx, e.owner, e.otherTask, "done"); return err },
		"担当者変更":    func(e *env) error { _, err := e.tasks.UpdateAssignee(ctx, e.owner, e.otherTask, nil); return err },
		"Task削除":   func(e *env) error { return e.tasks.Delete(ctx, e.owner, e.otherTask) },
		"コメント一覧":   func(e *env) error { _, err := e.comments.List(ctx, e.owner, e.otherTask); return err },
		"コメント投稿":   func(e *env) error { _, err := e.comments.Create(ctx, e.owner, e.otherTask, "x"); return err },
		"プロジェクト閲覧": func(e *env) error { _, err := e.projects.Get(ctx, e.owner, e.otherProject); return err },
		"プロジェクト削除": func(e *env) error { return e.projects.Delete(ctx, e.owner, e.otherProject) },
		"Task一覧": func(e *env) error {
			_, _, err := e.tasks.ListByProject(ctx, e.owner, e.otherProject, domain.TaskFilter{})
			return err
		},
	}
	for name, run := range ops {
		t.Run(name, func(t *testing.T) {
			e := newEnv(t) // e.owner は project の owner だが、otherProject のメンバーではない
			assertErr(t, run(e), notFound)
		})
	}
}

func assertErr(t *testing.T, got, want error) {
	t.Helper()
	if want == nil {
		if got != nil {
			t.Fatalf("want success, got %v", got)
		}
		return
	}
	if !errors.Is(got, want) {
		t.Fatalf("err = %v, want %v", got, want)
	}
}
