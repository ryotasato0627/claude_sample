package repository_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	"taskapp/backend/internal/domain"
)

// 整合性(部分更新・最後の owner・担当者)と、並行実行時の振る舞いを実 DB で検証する。
// 並行テストは、ロックが無い実装だとタイミング次第で失敗する。ロックがあれば毎回成功する。

const iterations = 25

func isInvalid(err error) bool {
	var ve *domain.ValidationError
	return errors.As(err, &ve)
}

// parallel は fns を同時に開始し、それぞれの結果を返す。
func parallel(fns ...func() error) []error {
	errs := make([]error, len(fns))
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i, fn := range fns {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			errs[i] = fn()
		}()
	}
	close(start)
	wg.Wait()
	return errs
}

// ---- 部分更新 ----

func TestPartialUpdate_ProjectAndTask(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	u := f.user(t, "u@example.com")
	p, err := f.projects.Update(ctx, f.project(t, "P", u.ID).ID, nil, ptr("desc"))
	if err != nil || p.Name != "P" || p.Description != "desc" {
		t.Fatalf("description only: %+v err=%v, want name kept", p, err)
	}
	if p, err = f.projects.Update(ctx, p.ID, ptr("Renamed"), nil); err != nil || p.Name != "Renamed" || p.Description != "desc" {
		t.Errorf("name only: %+v err=%v, want description kept", p, err)
	}
	if p, err = f.projects.Update(ctx, p.ID, nil, ptr("")); err != nil || p.Description != "" || p.Name != "Renamed" {
		t.Errorf("empty description is a real value (clears it): %+v err=%v", p, err)
	}
	if p, err = f.projects.Update(ctx, p.ID, nil, nil); err != nil || p.Name != "Renamed" {
		t.Errorf("nothing to update: %+v err=%v, want unchanged and no error", p, err)
	}

	tk := f.task(t, p.ID, "Title", "Desc", u.ID)
	got, err := f.tasks.UpdateContent(ctx, tk.ID, nil, ptr("New desc"))
	if err != nil || got.Title != "Title" || got.Description != "New desc" || !got.UpdatedAt.After(tk.UpdatedAt) {
		t.Errorf("task description only: %+v err=%v", got, err)
	}
	if got, err = f.tasks.UpdateContent(ctx, tk.ID, ptr("New title"), nil); err != nil || got.Title != "New title" || got.Description != "New desc" {
		t.Errorf("task title only: %+v err=%v, want description kept", got, err)
	}
}

// 別々の項目を同時に更新しても、どちらも失われない(「取得して全項目を上書き」だと片方が消える)。
func TestPartialUpdate_ConcurrentUpdatesOfDifferentFieldsAreBothKept(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	u := f.user(t, "u@example.com")
	p := f.project(t, "P", u.ID)

	for i := 0; i < iterations; i++ {
		tk := f.task(t, p.ID, "old title", "old desc", u.ID)
		errs := parallel(
			func() error { _, err := f.tasks.UpdateContent(ctx, tk.ID, ptr("new title"), nil); return err },
			func() error { _, err := f.tasks.UpdateContent(ctx, tk.ID, nil, ptr("new desc")); return err },
		)
		for _, err := range errs {
			if err != nil {
				t.Fatal(err)
			}
		}
		if got, _ := f.tasks.Get(ctx, tk.ID); got.Title != "new title" || got.Description != "new desc" {
			t.Fatalf("iteration %d: lost update: title=%q description=%q", i, got.Title, got.Description)
		}
	}
}

// ---- 最後の owner ----

func TestLastOwnerGuard(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	a, b := f.user(t, "a@example.com"), f.user(t, "b@example.com")
	p := f.project(t, "P", a.ID)
	if err := f.projects.AddMember(ctx, p.ID, b.ID, domain.RoleMember); err != nil {
		t.Fatal(err)
	}

	if err := f.projects.UpdateMemberRole(ctx, p.ID, a.ID, domain.RoleMember); !errors.Is(err, domain.ErrLastOwner) {
		t.Errorf("demote the only owner: err = %v, want ErrLastOwner", err)
	}
	if err := f.projects.RemoveMember(ctx, p.ID, a.ID); !errors.Is(err, domain.ErrLastOwner) {
		t.Errorf("remove the only owner: err = %v, want ErrLastOwner", err)
	}
	if role, _ := f.projects.GetMemberRole(ctx, p.ID, a.ID); role != domain.RoleOwner {
		t.Errorf("owner role = %q after rejected changes, want owner", role)
	}

	// owner 以外の変更は妨げない。owner を増やせば、片方を降格・削除できる
	if err := f.projects.UpdateMemberRole(ctx, p.ID, b.ID, domain.RoleViewer); err != nil {
		t.Errorf("change a non-owner: %v", err)
	}
	if err := f.projects.UpdateMemberRole(ctx, p.ID, b.ID, domain.RoleOwner); err != nil {
		t.Fatalf("promote: %v", err)
	}
	if err := f.projects.UpdateMemberRole(ctx, p.ID, a.ID, domain.RoleMember); err != nil {
		t.Errorf("demote one of two owners: %v", err)
	}
	if err := f.projects.RemoveMember(ctx, p.ID, b.ID); !errors.Is(err, domain.ErrLastOwner) {
		t.Errorf("remove the remaining owner: err = %v, want ErrLastOwner", err)
	}

	// 別プロジェクトの owner は数えない
	other := f.project(t, "Other", b.ID)
	if err := f.projects.UpdateMemberRole(ctx, other.ID, b.ID, domain.RoleMember); !errors.Is(err, domain.ErrLastOwner) {
		t.Errorf("other project's only owner: err = %v, want ErrLastOwner", err)
	}
}

// 2 人の owner が同時に相手を降格・削除しようとしても、owner は 0 人にならない。
func TestLastOwnerGuard_Concurrent(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	a, b := f.user(t, "a@example.com"), f.user(t, "b@example.com")

	type pair struct {
		name   string
		actOnA func(pid int64) error
		actOnB func(pid int64) error
	}
	demote := func(uid int64) func(int64) error {
		return func(pid int64) error { return f.projects.UpdateMemberRole(ctx, pid, uid, domain.RoleMember) }
	}
	remove := func(uid int64) func(int64) error {
		return func(pid int64) error { return f.projects.RemoveMember(ctx, pid, uid) }
	}
	for _, tc := range []pair{
		{"降格 × 降格", demote(a.ID), demote(b.ID)},
		{"削除 × 削除", remove(a.ID), remove(b.ID)},
		{"降格 × 削除", demote(a.ID), remove(b.ID)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for i := 0; i < iterations; i++ {
				p := f.project(t, "P", a.ID)
				if err := f.projects.AddMember(ctx, p.ID, b.ID, domain.RoleOwner); err != nil {
					t.Fatal(err)
				}
				errs := parallel(func() error { return tc.actOnA(p.ID) }, func() error { return tc.actOnB(p.ID) })

				succeeded, guarded := 0, 0
				for _, err := range errs {
					switch {
					case err == nil:
						succeeded++
					case errors.Is(err, domain.ErrLastOwner):
						guarded++
					default:
						t.Fatalf("iteration %d: unexpected error: %v", i, err)
					}
				}
				if n, _ := f.projects.CountOwners(ctx, p.ID); n != 1 || succeeded != 1 || guarded != 1 {
					t.Fatalf("iteration %d: owners=%d succeeded=%d guarded=%d, want exactly 1 owner left (1 succeeded, 1 rejected)", i, n, succeeded, guarded)
				}
			}
		})
	}
}

// ---- 担当者 ----

func TestUpdateAssignee_RequiresProjectMembership(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	owner, m, outsider := f.user(t, "owner@example.com"), f.user(t, "m@example.com"), f.user(t, "out@example.com")
	p, other := f.project(t, "P", owner.ID), f.project(t, "Other", outsider.ID)
	if err := f.projects.AddMember(ctx, p.ID, m.ID, domain.RoleViewer); err != nil {
		t.Fatal(err)
	}
	tk := f.task(t, p.ID, "T", "", owner.ID)

	if got, err := f.tasks.UpdateAssignee(ctx, tk.ID, &m.ID); err != nil || got.AssigneeID == nil || *got.AssigneeID != m.ID {
		t.Errorf("member (viewer) as assignee: %+v err=%v", got, err)
	}
	// 登録済みでも、別プロジェクトのメンバーは担当者にできない。変更は反映されない
	if _, err := f.tasks.UpdateAssignee(ctx, tk.ID, &outsider.ID); !isInvalid(err) {
		t.Errorf("non-member: err = %v, want ValidationError", err)
	}
	if got, _ := f.tasks.Get(ctx, tk.ID); got.AssigneeID == nil || *got.AssigneeID != m.ID {
		t.Errorf("assignee changed by a rejected request: %v", got.AssigneeID)
	}
	if _, err := f.tasks.UpdateAssignee(ctx, tk.ID, ptr(int64(999999))); !isInvalid(err) {
		t.Errorf("unknown user: err = %v, want ValidationError", err)
	}
	if got, err := f.tasks.UpdateAssignee(ctx, tk.ID, nil); err != nil || got.AssigneeID != nil {
		t.Errorf("unassign: %+v err=%v", got, err)
	}
	if _, err := f.tasks.UpdateAssignee(ctx, 999999, &m.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("unknown task: err = %v, want ErrNotFound", err)
	}
	_ = other
}

// 担当者の指定と、そのメンバーの削除が同時に起きても、「メンバーでない担当者」が残らない。
func TestUpdateAssignee_ConcurrentWithRemoveMember(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	owner, m := f.user(t, "owner@example.com"), f.user(t, "m@example.com")

	for i := 0; i < iterations; i++ {
		p := f.project(t, "P", owner.ID)
		if err := f.projects.AddMember(ctx, p.ID, m.ID, domain.RoleMember); err != nil {
			t.Fatal(err)
		}
		tk := f.task(t, p.ID, "T", "", owner.ID)

		errs := parallel(
			func() error { _, err := f.tasks.UpdateAssignee(ctx, tk.ID, &m.ID); return err },
			func() error { return f.projects.RemoveMember(ctx, p.ID, m.ID) },
		)
		if errs[0] != nil && !isInvalid(errs[0]) {
			t.Fatalf("iteration %d: assign: unexpected error %v", i, errs[0])
		}
		if errs[1] != nil {
			t.Fatalf("iteration %d: remove: %v", i, errs[1])
		}

		got, _ := f.tasks.Get(ctx, tk.ID)
		_, roleErr := f.projects.GetMemberRole(ctx, p.ID, m.ID)
		isMember := roleErr == nil
		if got.AssigneeID != nil && !isMember {
			t.Fatalf("iteration %d: task is assigned to user %d, who is no longer a member of the project", i, *got.AssigneeID)
		}
	}
}

// ---- 検索のページ指定 ----

// DB へは int32 で渡すため、範囲外は切り詰めずにエラーにする(offset=2^32 が offset 0 として動いてはいけない)。
func TestSearch_RejectsOutOfRangePaging(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	u := f.user(t, "u@example.com")
	f.task(t, f.project(t, "P", u.ID).ID, "T", "", u.ID)

	for name, flt := range map[string]domain.TaskFilter{
		"offset が int32 を超える": {UserID: u.ID, Limit: 10, Offset: 1 << 31},
		"offset が 2^32":       {UserID: u.ID, Limit: 10, Offset: 1 << 32},
		"offset が負":           {UserID: u.ID, Limit: 10, Offset: -1},
		"limit が 0":           {UserID: u.ID, Limit: 0},
		"limit が上限超過":         {UserID: u.ID, Limit: domain.MaxPageLimit + 1},
	} {
		if _, _, err := f.tasks.Search(ctx, flt); !isInvalid(err) {
			t.Errorf("%s: err = %v, want ValidationError", name, err)
		}
	}
	// 上限ちょうどは、エラーにならず(結果が空になるだけ)
	got, total, err := f.tasks.Search(ctx, domain.TaskFilter{UserID: u.ID, Limit: 10, Offset: domain.MaxPageOffset})
	if err != nil || len(got) != 0 || total != 1 {
		t.Errorf("offset at the maximum: got %v total=%d err=%v, want [] total=1", got, total, err)
	}
}
