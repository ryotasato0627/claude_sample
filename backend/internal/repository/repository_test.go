package repository_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"taskapp/backend/internal/domain"
	"taskapp/backend/internal/repository"
	"taskapp/backend/internal/testutil/pgtest"
)

// 実 DB(compose の db サービス)を使うテスト。テストごとに専用スキーマを使う。

type fixture struct {
	db       *sql.DB
	users    *repository.UserRepo
	projects *repository.ProjectRepo
	tasks    *repository.TaskRepo
	comments *repository.CommentRepo
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	db := pgtest.New(t)
	return &fixture{
		db:       db,
		users:    repository.NewUserRepo(db),
		projects: repository.NewProjectRepo(db),
		tasks:    repository.NewTaskRepo(db),
		comments: repository.NewCommentRepo(db),
	}
}

func (f *fixture) user(t *testing.T, email string) domain.User {
	t.Helper()
	u, err := f.users.Create(context.Background(), email, email, "hash")
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func (f *fixture) project(t *testing.T, name string, owner int64) domain.Project {
	t.Helper()
	p, err := f.projects.CreateWithOwner(context.Background(), name, "", owner)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func (f *fixture) task(t *testing.T, projectID int64, title, desc string, by int64) domain.Task {
	t.Helper()
	tk, err := f.tasks.Create(context.Background(), projectID, title, desc, by)
	if err != nil {
		t.Fatal(err)
	}
	return tk
}

func TestUserRepo(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)

	u, err := f.users.Create(ctx, "a@example.com", "A", "hash")
	if err != nil {
		t.Fatal(err)
	}
	if u.ID == 0 || u.CreatedAt.IsZero() || u.PasswordHash != "hash" {
		t.Errorf("got %+v", u)
	}

	got, err := f.users.GetByEmail(ctx, "a@example.com")
	if err != nil || got.ID != u.ID {
		t.Errorf("GetByEmail: %+v err=%v", got, err)
	}
	if _, err := f.users.GetByEmail(ctx, "nobody@example.com"); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("missing: err = %v, want ErrNotFound", err)
	}
	if _, err := f.users.Create(ctx, "a@example.com", "Dup", "hash"); !errors.Is(err, domain.ErrConflict) {
		t.Errorf("duplicate email: err = %v, want ErrConflict", err)
	}
}

func TestProjectRepo_CreateListUpdateDelete(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	alice, bob := f.user(t, "alice@example.com"), f.user(t, "bob@example.com")

	p := f.project(t, "P1", alice.ID)
	f.project(t, "P2", bob.ID)

	role, err := f.projects.GetMemberRole(ctx, p.ID, alice.ID)
	if err != nil || role != domain.RoleOwner {
		t.Errorf("creator role = %q err=%v, want owner", role, err)
	}
	if _, err := f.projects.GetMemberRole(ctx, p.ID, bob.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("non-member: err = %v, want ErrNotFound", err)
	}

	list, err := f.projects.ListByUser(ctx, alice.ID)
	if err != nil || len(list) != 1 || list[0].ID != p.ID || list[0].Role != domain.RoleOwner {
		t.Errorf("ListByUser = %+v err=%v, want only P1 as owner", list, err)
	}

	up, err := f.projects.Update(ctx, p.ID, "Renamed", "desc")
	if err != nil || up.Name != "Renamed" || up.Description != "desc" {
		t.Errorf("Update = %+v err=%v", up, err)
	}
	if _, err := f.projects.Update(ctx, 99999, "x", ""); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("update missing: err = %v, want ErrNotFound", err)
	}
	if _, err := f.projects.Get(ctx, 99999); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("get missing: err = %v, want ErrNotFound", err)
	}

	// 削除すると、メンバー・Task・コメントも消える(ON DELETE CASCADE)
	tk := f.task(t, p.ID, "t", "", alice.ID)
	c, err := f.comments.Create(ctx, tk.ID, alice.ID, "hi")
	if err != nil {
		t.Fatal(err)
	}
	if err := f.projects.Delete(ctx, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.tasks.Get(ctx, tk.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("task must be cascaded: err = %v", err)
	}
	if _, err := f.comments.Get(ctx, c.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("comment must be cascaded: err = %v", err)
	}
	if err := f.projects.Delete(ctx, p.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("delete twice: err = %v, want ErrNotFound", err)
	}
}

func TestProjectRepo_CreateWithOwner_UnknownOwnerRollsBack(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)

	// 存在しないユーザーを owner にすると、プロジェクトも作られない(1 トランザクション)
	if _, err := f.projects.CreateWithOwner(ctx, "ghost", "", 99999); err == nil {
		t.Fatal("want error for unknown owner")
	}
	var n int
	if err := f.db.QueryRowContext(ctx, `SELECT count(*) FROM projects`).Scan(&n); err != nil || n != 0 {
		t.Errorf("projects count = %d err=%v, want 0 (rolled back)", n, err)
	}
}

func TestProjectRepo_Members(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	owner, m1, m2 := f.user(t, "owner@example.com"), f.user(t, "m1@example.com"), f.user(t, "m2@example.com")
	p := f.project(t, "P", owner.ID)
	other := f.project(t, "Other", owner.ID)

	if err := f.projects.AddMember(ctx, p.ID, m1.ID, domain.RoleMember); err != nil {
		t.Fatal(err)
	}
	if err := f.projects.AddMember(ctx, p.ID, m1.ID, domain.RoleViewer); !errors.Is(err, domain.ErrConflict) {
		t.Errorf("duplicate member: err = %v, want ErrConflict", err)
	}
	if err := f.projects.AddMember(ctx, 99999, m2.ID, domain.RoleMember); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("unknown project: err = %v, want ErrNotFound", err)
	}
	if err := f.projects.AddMember(ctx, p.ID, 99999, domain.RoleMember); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("unknown user: err = %v, want ErrNotFound", err)
	}
	// DB の CHECK 制約でも、不正なロールは弾く
	if err := f.projects.AddMember(ctx, p.ID, m2.ID, domain.Role("admin")); err == nil {
		t.Error("invalid role must be rejected by the CHECK constraint")
	}

	members, err := f.projects.ListMembers(ctx, p.ID)
	if err != nil || len(members) != 2 {
		t.Fatalf("ListMembers = %+v err=%v, want 2", members, err)
	}
	if members[0].UserID != owner.ID || members[0].Role != domain.RoleOwner || members[0].Email != "owner@example.com" {
		t.Errorf("members[0] = %+v", members[0])
	}

	got, err := f.projects.GetMember(ctx, p.ID, m1.ID)
	if err != nil || got.Role != domain.RoleMember || got.Name != "m1@example.com" {
		t.Errorf("GetMember = %+v err=%v", got, err)
	}
	if _, err := f.projects.GetMember(ctx, p.ID, m2.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("GetMember non-member: err = %v, want ErrNotFound", err)
	}

	if err := f.projects.UpdateMemberRole(ctx, p.ID, m1.ID, domain.RoleOwner); err != nil {
		t.Fatal(err)
	}
	if n, err := f.projects.CountOwners(ctx, p.ID); err != nil || n != 2 {
		t.Errorf("CountOwners = %d err=%v, want 2", n, err)
	}
	if n, _ := f.projects.CountOwners(ctx, other.ID); n != 1 {
		t.Errorf("CountOwners(other) = %d, want 1 (プロジェクトごとに数える)", n)
	}
	if err := f.projects.UpdateMemberRole(ctx, p.ID, m2.ID, domain.RoleViewer); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("update non-member: err = %v, want ErrNotFound", err)
	}
}

func TestProjectRepo_RemoveMember_UnassignsTasksInThatProjectOnly(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	owner, m := f.user(t, "owner@example.com"), f.user(t, "m@example.com")
	p, other := f.project(t, "P", owner.ID), f.project(t, "Other", owner.ID)
	for _, pid := range []int64{p.ID, other.ID} {
		if err := f.projects.AddMember(ctx, pid, m.ID, domain.RoleMember); err != nil {
			t.Fatal(err)
		}
	}
	inP, inOther := f.task(t, p.ID, "in P", "", owner.ID), f.task(t, other.ID, "in Other", "", owner.ID)
	for _, id := range []int64{inP.ID, inOther.ID} {
		if _, err := f.tasks.UpdateAssignee(ctx, id, &m.ID); err != nil {
			t.Fatal(err)
		}
	}

	if err := f.projects.RemoveMember(ctx, p.ID, m.ID); err != nil {
		t.Fatal(err)
	}

	if got, _ := f.tasks.Get(ctx, inP.ID); got.AssigneeID != nil {
		t.Errorf("task in P must be unassigned, got %v", *got.AssigneeID)
	}
	if got, _ := f.tasks.Get(ctx, inOther.ID); got.AssigneeID == nil || *got.AssigneeID != m.ID {
		t.Errorf("task in Other must keep its assignee, got %v", got.AssigneeID)
	}
	if err := f.projects.RemoveMember(ctx, p.ID, m.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("remove twice: err = %v, want ErrNotFound", err)
	}
}

func TestTaskRepo_CRUD(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	u := f.user(t, "u@example.com")
	p := f.project(t, "P", u.ID)

	tk := f.task(t, p.ID, "Title", "Desc", u.ID)
	if tk.Status != domain.StatusTodo || tk.AssigneeID != nil || tk.CreatedBy != u.ID || tk.ProjectID != p.ID {
		t.Errorf("created = %+v", tk)
	}

	up, err := f.tasks.UpdateContent(ctx, tk.ID, "New", "New desc")
	if err != nil || up.Title != "New" || up.Description != "New desc" || !up.UpdatedAt.After(tk.UpdatedAt) {
		t.Errorf("UpdateContent = %+v err=%v (updated_at must advance)", up, err)
	}
	st, err := f.tasks.UpdateStatus(ctx, tk.ID, domain.StatusInProgress)
	if err != nil || st.Status != domain.StatusInProgress {
		t.Errorf("UpdateStatus = %+v err=%v", st, err)
	}
	as, err := f.tasks.UpdateAssignee(ctx, tk.ID, &u.ID)
	if err != nil || as.AssigneeID == nil || *as.AssigneeID != u.ID {
		t.Errorf("UpdateAssignee = %+v err=%v", as, err)
	}
	cl, err := f.tasks.UpdateAssignee(ctx, tk.ID, nil)
	if err != nil || cl.AssigneeID != nil {
		t.Errorf("clear assignee = %+v err=%v", cl, err)
	}

	// DB の CHECK 制約でも、不正なステータスは弾く
	if _, err := f.tasks.UpdateStatus(ctx, tk.ID, domain.TaskStatus("blocked")); err == nil {
		t.Error("invalid status must be rejected by the CHECK constraint")
	}

	for name, fn := range map[string]func() error{
		"Get":            func() error { _, err := f.tasks.Get(ctx, 99999); return err },
		"UpdateContent":  func() error { _, err := f.tasks.UpdateContent(ctx, 99999, "x", ""); return err },
		"UpdateStatus":   func() error { _, err := f.tasks.UpdateStatus(ctx, 99999, domain.StatusDone); return err },
		"UpdateAssignee": func() error { _, err := f.tasks.UpdateAssignee(ctx, 99999, nil); return err },
		"Delete":         func() error { return f.tasks.Delete(ctx, 99999) },
	} {
		if err := fn(); !errors.Is(err, domain.ErrNotFound) {
			t.Errorf("%s missing: err = %v, want ErrNotFound", name, err)
		}
	}

	if err := f.tasks.Delete(ctx, tk.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.tasks.Get(ctx, tk.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("after delete: err = %v, want ErrNotFound", err)
	}
}

func ids(tasks []domain.Task) []int64 {
	out := make([]int64, len(tasks))
	for i, t := range tasks {
		out[i] = t.ID
	}
	return out
}

func equalIDs(a, b []int64) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestTaskRepo_Search(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	alice, bob, carol := f.user(t, "alice@example.com"), f.user(t, "bob@example.com"), f.user(t, "carol@example.com")
	pa := f.project(t, "A", alice.ID) // alice(owner), bob(member)
	pb := f.project(t, "B", carol.ID) // carol(owner)
	if err := f.projects.AddMember(ctx, pa.ID, bob.ID, domain.RoleMember); err != nil {
		t.Fatal(err)
	}

	a1 := f.task(t, pa.ID, "Write report", "quarterly numbers", alice.ID)
	a2 := f.task(t, pa.ID, "Fix login bug", "", alice.ID)
	a3 := f.task(t, pa.ID, "Deploy", "to production", alice.ID)
	b1 := f.task(t, pb.ID, "Write report", "", carol.ID)
	if _, err := f.tasks.UpdateStatus(ctx, a2.ID, domain.StatusDone); err != nil {
		t.Fatal(err)
	}
	if _, err := f.tasks.UpdateAssignee(ctx, a3.ID, &bob.ID); err != nil {
		t.Fatal(err)
	}

	search := func(t *testing.T, f2 domain.TaskFilter) ([]int64, int) {
		t.Helper()
		if f2.Limit == 0 {
			f2.Limit = 100
		}
		got, total, err := f.tasks.Search(ctx, f2)
		if err != nil {
			t.Fatal(err)
		}
		return ids(got), total
	}
	done := domain.StatusDone

	t.Run("所属するプロジェクトの Task のみ(更新日時の降順)", func(t *testing.T) {
		// a2, a3 を更新したので、更新が新しい順: a3, a2, a1
		if got, total := search(t, domain.TaskFilter{UserID: alice.ID}); !equalIDs(got, []int64{a3.ID, a2.ID, a1.ID}) || total != 3 {
			t.Errorf("alice: got %v total=%d, want [a3 a2 a1]", got, total)
		}
		if got, _ := search(t, domain.TaskFilter{UserID: bob.ID}); len(got) != 3 {
			t.Errorf("bob (member of A): got %v, want 3 tasks", got)
		}
		if got, _ := search(t, domain.TaskFilter{UserID: carol.ID}); !equalIDs(got, []int64{b1.ID}) {
			t.Errorf("carol: got %v, want only B's task", got)
		}
	})
	t.Run("どのプロジェクトにも所属しないユーザーには何も返らない", func(t *testing.T) {
		stranger := f.user(t, "stranger@example.com")
		if got, total := search(t, domain.TaskFilter{UserID: stranger.ID}); len(got) != 0 || total != 0 {
			t.Errorf("got %v total=%d, want none", got, total)
		}
	})
	t.Run("所属していないプロジェクトを ProjectID で指定しても返らない", func(t *testing.T) {
		if got, total := search(t, domain.TaskFilter{UserID: alice.ID, ProjectID: &pb.ID}); len(got) != 0 || total != 0 {
			t.Errorf("got %v total=%d, want none", got, total)
		}
	})
	t.Run("ProjectID / status / assignee で絞り込む", func(t *testing.T) {
		if got, _ := search(t, domain.TaskFilter{UserID: alice.ID, ProjectID: &pa.ID}); len(got) != 3 {
			t.Errorf("project: got %v", got)
		}
		if got, _ := search(t, domain.TaskFilter{UserID: alice.ID, Status: &done}); !equalIDs(got, []int64{a2.ID}) {
			t.Errorf("status: got %v, want [a2]", got)
		}
		if got, _ := search(t, domain.TaskFilter{UserID: alice.ID, AssigneeID: &bob.ID}); !equalIDs(got, []int64{a3.ID}) {
			t.Errorf("assignee: got %v, want [a3]", got)
		}
		if got, _ := search(t, domain.TaskFilter{UserID: alice.ID, Status: &done, AssigneeID: &bob.ID}); len(got) != 0 {
			t.Errorf("AND 条件: got %v, want none", got)
		}
	})
	t.Run("キーワードはタイトル・説明の部分一致(大文字小文字を区別しない)", func(t *testing.T) {
		if got, _ := search(t, domain.TaskFilter{UserID: alice.ID, Query: "REPORT"}); !equalIDs(got, []int64{a1.ID}) {
			t.Errorf("title: got %v, want [a1]", got)
		}
		if got, _ := search(t, domain.TaskFilter{UserID: alice.ID, Query: "Production"}); !equalIDs(got, []int64{a3.ID}) {
			t.Errorf("description: got %v, want [a3]", got)
		}
	})
	t.Run("ページネーション: total は絞り込み後の全件数", func(t *testing.T) {
		got, total := search(t, domain.TaskFilter{UserID: alice.ID, Limit: 2, Offset: 0})
		if !equalIDs(got, []int64{a3.ID, a2.ID}) || total != 3 {
			t.Errorf("page1: got %v total=%d", got, total)
		}
		got, total = search(t, domain.TaskFilter{UserID: alice.ID, Limit: 2, Offset: 2})
		if !equalIDs(got, []int64{a1.ID}) || total != 3 {
			t.Errorf("page2: got %v total=%d", got, total)
		}
		got, total = search(t, domain.TaskFilter{UserID: alice.ID, Limit: 2, Offset: 10})
		if len(got) != 0 || total != 3 {
			t.Errorf("beyond: got %v total=%d, want [] total=3", got, total)
		}
	})
	t.Run("更新すると先頭に来る", func(t *testing.T) {
		if _, err := f.tasks.UpdateContent(ctx, a1.ID, "Write report v2", "quarterly numbers"); err != nil {
			t.Fatal(err)
		}
		if got, _ := search(t, domain.TaskFilter{UserID: alice.ID}); got[0] != a1.ID {
			t.Errorf("got %v, want a1 first", got)
		}
	})
}

// LIKE のメタ文字(% _ \)は「文字そのもの」として検索されること。
func TestTaskRepo_Search_LikeMetaCharactersAreLiteral(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	u := f.user(t, "u@example.com")
	p := f.project(t, "P", u.ID)
	pct := f.task(t, p.ID, "100% done", "", u.ID)
	under := f.task(t, p.ID, "snake_case", "", u.ID)
	f.task(t, p.ID, "snakeXcase", "", u.ID)
	bs := f.task(t, p.ID, `path\to`, "", u.ID)
	f.task(t, p.ID, "plain", "", u.ID)

	tests := []struct {
		query string
		want  []int64
	}{
		{"%", []int64{pct.ID}},            // 全件にマッチしてはいけない
		{"_", []int64{under.ID}},          // 任意の 1 文字にマッチしてはいけない
		{"snake_case", []int64{under.ID}}, // snakeXcase にマッチしてはいけない
		{`\`, []int64{bs.ID}},
	}
	for _, tt := range tests {
		got, total, err := f.tasks.Search(ctx, domain.TaskFilter{UserID: u.ID, Query: tt.query, Limit: 100})
		if err != nil {
			t.Fatalf("query %q: %v", tt.query, err)
		}
		if !equalIDs(ids(got), tt.want) || total != len(tt.want) {
			t.Errorf("query %q: got %v total=%d, want %v", tt.query, ids(got), total, tt.want)
		}
	}
}

func TestCommentRepo(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	u := f.user(t, "u@example.com")
	p := f.project(t, "P", u.ID)
	tk := f.task(t, p.ID, "T", "", u.ID)
	other := f.task(t, p.ID, "Other", "", u.ID)

	c1, err := f.comments.Create(ctx, tk.ID, u.ID, "first")
	if err != nil {
		t.Fatal(err)
	}
	c2, _ := f.comments.Create(ctx, tk.ID, u.ID, "second")
	f.comments.Create(ctx, other.ID, u.ID, "elsewhere") //nolint:errcheck // 別 Task のコメント(一覧に混ざらないことの確認用)

	list, err := f.comments.ListByTask(ctx, tk.ID)
	if err != nil || len(list) != 2 || list[0].ID != c1.ID || list[1].ID != c2.ID {
		t.Errorf("ListByTask = %+v err=%v, want [first second] in order", list, err)
	}

	up, err := f.comments.UpdateBody(ctx, c1.ID, "edited")
	if err != nil || up.Body != "edited" || !up.UpdatedAt.After(c1.UpdatedAt) || !up.CreatedAt.Equal(c1.CreatedAt) {
		t.Errorf("UpdateBody = %+v err=%v (updated_at advances, created_at stays)", up, err)
	}
	if got, err := f.comments.Get(ctx, c1.ID); err != nil || got.Body != "edited" {
		t.Errorf("Get = %+v err=%v", got, err)
	}

	if err := f.comments.Delete(ctx, c1.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.comments.Get(ctx, c1.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("after delete: err = %v", err)
	}
	if err := f.comments.Delete(ctx, c1.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("delete twice: err = %v, want ErrNotFound", err)
	}
	if _, err := f.comments.UpdateBody(ctx, 99999, "x"); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("update missing: err = %v, want ErrNotFound", err)
	}
	if _, err := f.comments.Create(ctx, 99999, u.ID, "x"); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("create on missing task: err = %v, want ErrNotFound", err)
	}

	// Task を削除するとコメントも消える
	if err := f.tasks.Delete(ctx, tk.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.comments.Get(ctx, c2.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("comment must be cascaded on task delete: err = %v", err)
	}
}
