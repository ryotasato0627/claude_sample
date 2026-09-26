package service_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"taskapp/backend/internal/domain"
)

func TestProjectCreate(t *testing.T) {
	ctx := context.Background()
	e := newEnv(t)

	p, err := e.projects.Create(ctx, e.newcomer, "  New  ", "desc")
	if err != nil {
		t.Fatal(err)
	}
	if p.Name != "New" || p.Role != domain.RoleOwner {
		t.Errorf("got %+v, want name=New role=owner", p)
	}
	// 作成者は owner として登録される
	if role := e.s.members[[2]int64{p.ID, e.newcomer}]; role != domain.RoleOwner {
		t.Errorf("creator role = %q, want owner", role)
	}

	for name, in := range map[string]string{"空": "", "空白のみ": "  ", "長すぎる": strings.Repeat("a", 101)} {
		t.Run("名前が"+name, func(t *testing.T) {
			if _, err := e.projects.Create(ctx, e.newcomer, in, ""); !isValidation(err) {
				t.Errorf("err = %v, want ValidationError", err)
			}
		})
	}
}

func TestProjectList_OnlyOwnProjects(t *testing.T) {
	e := newEnv(t)
	got, err := e.projects.List(context.Background(), e.viewer)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != e.project || got[0].Role != domain.RoleViewer {
		t.Errorf("got %+v, want only project %d as viewer", got, e.project)
	}
}

func TestProjectUpdate_PartialUpdate(t *testing.T) {
	ctx := context.Background()
	e := newEnv(t)
	if _, err := e.projects.Update(ctx, e.owner, e.project, nil, str("only description")); err != nil {
		t.Fatal(err)
	}
	p := e.s.projects[e.project]
	if p.Name != "P" || p.Description != "only description" {
		t.Errorf("got %+v, want name kept and description updated", p)
	}
	if _, err := e.projects.Update(ctx, e.owner, e.project, str(" "), nil); !isValidation(err) {
		t.Errorf("blank name: err = %v, want ValidationError", err)
	}
}

func TestAddMember(t *testing.T) {
	ctx := context.Background()

	t.Run("メールは大文字小文字を区別せず、ロールが付く", func(t *testing.T) {
		e := newEnv(t)
		m, err := e.projects.AddMember(ctx, e.owner, e.project, " NewComer@Example.com ", "viewer")
		if err != nil {
			t.Fatal(err)
		}
		if m.UserID != e.newcomer || m.Role != domain.RoleViewer {
			t.Errorf("got %+v", m)
		}
	})
	t.Run("既にメンバーなら ErrConflict", func(t *testing.T) {
		e := newEnv(t)
		_, err := e.projects.AddMember(ctx, e.owner, e.project, "member@example.com", "member")
		if !errors.Is(err, domain.ErrConflict) {
			t.Errorf("err = %v, want ErrConflict", err)
		}
	})
	t.Run("未登録のメールは ValidationError", func(t *testing.T) {
		e := newEnv(t)
		if _, err := e.projects.AddMember(ctx, e.owner, e.project, "nobody@example.com", "member"); !isValidation(err) {
			t.Errorf("err = %v, want ValidationError", err)
		}
	})
	t.Run("不正なロールは ValidationError", func(t *testing.T) {
		e := newEnv(t)
		if _, err := e.projects.AddMember(ctx, e.owner, e.project, "newcomer@example.com", "admin"); !isValidation(err) {
			t.Errorf("err = %v, want ValidationError", err)
		}
	})
}

func TestLastOwner(t *testing.T) {
	ctx := context.Background()

	t.Run("唯一の owner は降格できない", func(t *testing.T) {
		e := newEnv(t)
		_, err := e.projects.UpdateMemberRole(ctx, e.owner, e.project, e.owner, "member")
		if !errors.Is(err, domain.ErrLastOwner) || !errors.Is(err, domain.ErrConflict) {
			t.Errorf("err = %v, want ErrLastOwner (ErrConflict)", err)
		}
		if e.s.members[[2]int64{e.project, e.owner}] != domain.RoleOwner {
			t.Error("owner must stay owner")
		}
	})
	t.Run("唯一の owner は削除(退出)できない", func(t *testing.T) {
		e := newEnv(t)
		if err := e.projects.RemoveMember(ctx, e.owner, e.project, e.owner); !errors.Is(err, domain.ErrLastOwner) {
			t.Errorf("err = %v, want ErrLastOwner", err)
		}
		if _, ok := e.s.members[[2]int64{e.project, e.owner}]; !ok {
			t.Error("owner must stay a member")
		}
	})
	t.Run("owner が複数いれば降格・削除できる", func(t *testing.T) {
		e := newEnv(t)
		if _, err := e.projects.UpdateMemberRole(ctx, e.owner, e.project, e.member, "owner"); err != nil {
			t.Fatal(err)
		}
		if _, err := e.projects.UpdateMemberRole(ctx, e.member, e.project, e.owner, "viewer"); err != nil {
			t.Errorf("demote: %v", err)
		}
		// これで member が唯一の owner
		if err := e.projects.RemoveMember(ctx, e.member, e.project, e.member); !errors.Is(err, domain.ErrLastOwner) {
			t.Errorf("remove last owner: err = %v, want ErrLastOwner", err)
		}
	})
	t.Run("owner 以外の変更は影響しない", func(t *testing.T) {
		e := newEnv(t)
		if err := e.projects.RemoveMember(ctx, e.owner, e.project, e.viewer); err != nil {
			t.Errorf("err = %v", err)
		}
	})
	t.Run("メンバーでないユーザーの変更・削除は ErrNotFound", func(t *testing.T) {
		e := newEnv(t)
		if _, err := e.projects.UpdateMemberRole(ctx, e.owner, e.project, e.newcomer, "member"); !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("update: err = %v, want ErrNotFound", err)
		}
		if err := e.projects.RemoveMember(ctx, e.owner, e.project, e.newcomer); !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("remove: err = %v, want ErrNotFound", err)
		}
	})
}

func TestTaskAssignee(t *testing.T) {
	ctx := context.Background()

	t.Run("メンバーは担当者にできる(viewer も可)", func(t *testing.T) {
		e := newEnv(t)
		for _, uid := range []int64{e.owner, e.member, e.viewer} {
			task, err := e.tasks.UpdateAssignee(ctx, e.member, e.task, &uid)
			if err != nil {
				t.Fatalf("assignee %d: %v", uid, err)
			}
			if task.AssigneeID == nil || *task.AssigneeID != uid {
				t.Errorf("assignee = %v, want %d", task.AssigneeID, uid)
			}
		}
	})
	t.Run("そのプロジェクトのメンバーでないユーザーは指定できない", func(t *testing.T) {
		e := newEnv(t)
		// outsider は登録済みだが project のメンバーではない
		_, err := e.tasks.UpdateAssignee(ctx, e.member, e.task, &e.outsider)
		if !isValidation(err) {
			t.Errorf("err = %v, want ValidationError", err)
		}
		if e.s.tasks[e.task].AssigneeID != nil {
			t.Error("assignee must not change on error")
		}
	})
	t.Run("nil で解除できる", func(t *testing.T) {
		e := newEnv(t)
		if _, err := e.tasks.UpdateAssignee(ctx, e.member, e.task, &e.member); err != nil {
			t.Fatal(err)
		}
		task, err := e.tasks.UpdateAssignee(ctx, e.member, e.task, nil)
		if err != nil || task.AssigneeID != nil {
			t.Errorf("task=%+v err=%v, want unassigned", task, err)
		}
	})
}

func TestTaskCreateAndUpdate(t *testing.T) {
	ctx := context.Background()

	t.Run("作成: 初期ステータスは todo、作成者が記録される", func(t *testing.T) {
		e := newEnv(t)
		task, err := e.tasks.Create(ctx, e.member, e.project, "  Title ", str(" desc "))
		if err != nil {
			t.Fatal(err)
		}
		if task.Title != "Title" || task.Description != "desc" || task.Status != domain.StatusTodo || task.CreatedBy != e.member || task.AssigneeID != nil {
			t.Errorf("got %+v", task)
		}
	})
	t.Run("作成: タイトルの検証", func(t *testing.T) {
		e := newEnv(t)
		for name, title := range map[string]string{"空": "", "空白のみ": " \t", "201文字": strings.Repeat("a", 201)} {
			if _, err := e.tasks.Create(ctx, e.member, e.project, title, nil); !isValidation(err) {
				t.Errorf("title %s: err = %v, want ValidationError", name, err)
			}
		}
		if _, err := e.tasks.Create(ctx, e.member, e.project, strings.Repeat("a", 200), nil); err != nil {
			t.Errorf("200文字は OK: %v", err)
		}
	})
	t.Run("更新: 指定した項目だけ変わる", func(t *testing.T) {
		e := newEnv(t)
		task, err := e.tasks.Update(ctx, e.member, e.task, nil, str("new desc"))
		if err != nil {
			t.Fatal(err)
		}
		if task.Title != "task" || task.Description != "new desc" {
			t.Errorf("got %+v, want title kept", task)
		}
		if _, err := e.tasks.Update(ctx, e.member, e.task, str(""), nil); !isValidation(err) {
			t.Errorf("empty title: err = %v, want ValidationError", err)
		}
	})
	t.Run("ステータス: 遷移は自由。不正な値は ValidationError", func(t *testing.T) {
		e := newEnv(t)
		for _, st := range []string{"done", "todo", "in_progress", "done"} {
			task, err := e.tasks.UpdateStatus(ctx, e.member, e.task, st)
			if err != nil || string(task.Status) != st {
				t.Fatalf("status %s: task=%+v err=%v", st, task, err)
			}
		}
		if _, err := e.tasks.UpdateStatus(ctx, e.member, e.task, "blocked"); !isValidation(err) {
			t.Errorf("err = %v, want ValidationError", err)
		}
	})
}

func TestTaskSearch(t *testing.T) {
	ctx := context.Background()

	t.Run("actor が所属するプロジェクトの Task のみ返す", func(t *testing.T) {
		e := newEnv(t)
		tasks, total, err := e.tasks.Search(ctx, e.owner, domain.TaskFilter{})
		if err != nil {
			t.Fatal(err)
		}
		if total != 1 || len(tasks) != 1 || tasks[0].ID != e.task {
			t.Errorf("got %+v total=%d, want only task %d", tasks, total, e.task)
		}
	})
	t.Run("フィルタの UserID は actor で上書きされる(他人の ID を指定できない)", func(t *testing.T) {
		e := newEnv(t)
		if _, _, err := e.tasks.Search(ctx, e.owner, domain.TaskFilter{UserID: e.outsider}); err != nil {
			t.Fatal(err)
		}
		if e.s.lastFilter.UserID != e.owner {
			t.Errorf("filter.UserID = %d, want %d", e.s.lastFilter.UserID, e.owner)
		}
	})
	t.Run("プロジェクト内一覧は、フィルタの ProjectID を上書きする", func(t *testing.T) {
		e := newEnv(t)
		if _, _, err := e.tasks.ListByProject(ctx, e.owner, e.project, domain.TaskFilter{ProjectID: &e.otherProject}); err != nil {
			t.Fatal(err)
		}
		if got := e.s.lastFilter.ProjectID; got == nil || *got != e.project {
			t.Errorf("filter.ProjectID = %v, want %d", got, e.project)
		}
	})
	t.Run("limit の既定値と検証", func(t *testing.T) {
		e := newEnv(t)
		if _, _, err := e.tasks.Search(ctx, e.owner, domain.TaskFilter{}); err != nil || e.s.lastFilter.Limit != 20 {
			t.Errorf("default limit = %d err=%v, want 20", e.s.lastFilter.Limit, err)
		}
		for _, limit := range []int{-1, 101} {
			if _, _, err := e.tasks.Search(ctx, e.owner, domain.TaskFilter{Limit: limit}); !isValidation(err) {
				t.Errorf("limit %d: err = %v, want ValidationError", limit, err)
			}
		}
		if _, _, err := e.tasks.Search(ctx, e.owner, domain.TaskFilter{Limit: 100}); err != nil {
			t.Errorf("limit 100 は OK: %v", err)
		}
	})
	t.Run("offset・status・q の検証", func(t *testing.T) {
		e := newEnv(t)
		bad := domain.TaskStatus("blocked")
		for name, f := range map[string]domain.TaskFilter{
			"offset が負":  {Offset: -1},
			"不正な status": {Status: &bad},
			"q が長すぎる":    {Query: strings.Repeat("a", 201)},
		} {
			if _, _, err := e.tasks.Search(ctx, e.owner, f); !isValidation(err) {
				t.Errorf("%s: err = %v, want ValidationError", name, err)
			}
		}
	})
	t.Run("q は前後の空白を除いて渡される", func(t *testing.T) {
		e := newEnv(t)
		if _, _, err := e.tasks.Search(ctx, e.owner, domain.TaskFilter{Query: "  abc "}); err != nil {
			t.Fatal(err)
		}
		if e.s.lastFilter.Query != "abc" {
			t.Errorf("query = %q, want abc", e.s.lastFilter.Query)
		}
	})
}

func TestCommentBodyValidation(t *testing.T) {
	ctx := context.Background()
	e := newEnv(t)

	for name, body := range map[string]string{"空": "", "空白のみ": "  ", "5001文字": strings.Repeat("a", 5001)} {
		t.Run(name, func(t *testing.T) {
			if _, err := e.comments.Create(ctx, e.member, e.task, body); !isValidation(err) {
				t.Errorf("create: err = %v, want ValidationError", err)
			}
			if _, err := e.comments.Update(ctx, e.member, e.memberComment, body); !isValidation(err) {
				t.Errorf("update: err = %v, want ValidationError", err)
			}
		})
	}
	c, err := e.comments.Create(ctx, e.member, e.task, "  hello ")
	if err != nil || c.Body != "hello" || c.UserID != e.member || c.TaskID != e.task {
		t.Errorf("got %+v err=%v", c, err)
	}
	list, err := e.comments.List(ctx, e.viewer, e.task)
	if err != nil || len(list) != 3 {
		t.Errorf("list len = %d err=%v, want 3", len(list), err)
	}
}

func TestNotFound(t *testing.T) {
	ctx := context.Background()
	e := newEnv(t)
	const missing = 99999

	checks := map[string]error{
		"Task":   func() error { _, err := e.tasks.Get(ctx, e.owner, missing); return err }(),
		"コメント更新": func() error { _, err := e.comments.Update(ctx, e.owner, missing, "x"); return err }(),
		"コメント削除": e.comments.Delete(ctx, e.owner, missing),
		"プロジェクト": func() error { _, err := e.projects.Get(ctx, e.owner, missing); return err }(),
		"Task一覧": func() error {
			_, _, err := e.tasks.ListByProject(ctx, e.owner, missing, domain.TaskFilter{})
			return err
		}(),
		"メンバー一覧":  func() error { _, err := e.projects.ListMembers(ctx, e.owner, missing); return err }(),
		"Task作成":  func() error { _, err := e.tasks.Create(ctx, e.owner, missing, "x", nil); return err }(),
		"コメント一覧":  func() error { _, err := e.comments.List(ctx, e.owner, missing); return err }(),
		"コメント投稿":  func() error { _, err := e.comments.Create(ctx, e.owner, missing, "x"); return err }(),
		"ステータス変更": func() error { _, err := e.tasks.UpdateStatus(ctx, e.owner, missing, "done"); return err }(),
	}
	for name, err := range checks {
		if !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("%s: err = %v, want ErrNotFound", name, err)
		}
	}
}
