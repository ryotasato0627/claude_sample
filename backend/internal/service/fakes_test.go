package service_test

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"taskapp/backend/internal/domain"
)

// store は fake repository 群で共有するインメモリのデータ。
type store struct {
	nextID   int64
	users    map[int64]domain.User
	projects map[int64]domain.Project
	members  map[[2]int64]domain.Role // {projectID, userID}
	tasks    map[int64]domain.Task
	comments map[int64]domain.Comment

	lastFilter domain.TaskFilter // Search に渡された最後のフィルタ
}

func newStore() *store {
	return &store{
		users:    map[int64]domain.User{},
		projects: map[int64]domain.Project{},
		members:  map[[2]int64]domain.Role{},
		tasks:    map[int64]domain.Task{},
		comments: map[int64]domain.Comment{},
	}
}

func (s *store) id() int64 { s.nextID++; return s.nextID }

// ---- users ----

type fakeUsers struct{ s *store }

func (f fakeUsers) Create(_ context.Context, email, name, hash string) (domain.User, error) {
	for _, u := range f.s.users {
		if u.Email == email {
			return domain.User{}, domain.ErrConflict
		}
	}
	u := domain.User{ID: f.s.id(), Email: email, Name: name, PasswordHash: hash}
	f.s.users[u.ID] = u
	return u, nil
}

func (f fakeUsers) GetByEmail(_ context.Context, email string) (domain.User, error) {
	for _, u := range f.s.users {
		if u.Email == email {
			return u, nil
		}
	}
	return domain.User{}, domain.ErrNotFound
}

// ---- projects ----

type fakeProjects struct{ s *store }

func (f fakeProjects) GetMemberRole(_ context.Context, projectID, userID int64) (domain.Role, error) {
	r, ok := f.s.members[[2]int64{projectID, userID}]
	if !ok {
		return "", domain.ErrNotFound
	}
	return r, nil
}

func (f fakeProjects) CreateWithOwner(_ context.Context, name, desc string, ownerID int64) (domain.Project, error) {
	p := domain.Project{ID: f.s.id(), Name: name, Description: desc}
	f.s.projects[p.ID] = p
	f.s.members[[2]int64{p.ID, ownerID}] = domain.RoleOwner
	return p, nil
}

func (f fakeProjects) Get(_ context.Context, id int64) (domain.Project, error) {
	p, ok := f.s.projects[id]
	if !ok {
		return domain.Project{}, domain.ErrNotFound
	}
	return p, nil
}

func (f fakeProjects) ListByUser(_ context.Context, userID int64) ([]domain.ProjectWithRole, error) {
	var out []domain.ProjectWithRole
	for k, r := range f.s.members {
		if k[1] == userID {
			out = append(out, domain.ProjectWithRole{Project: f.s.projects[k[0]], Role: r})
		}
	}
	return out, nil
}

func (f fakeProjects) Update(_ context.Context, id int64, name, desc *string) (domain.Project, error) {
	p, ok := f.s.projects[id]
	if !ok {
		return domain.Project{}, domain.ErrNotFound
	}
	if name != nil {
		p.Name = *name
	}
	if desc != nil {
		p.Description = *desc
	}
	f.s.projects[id] = p
	return p, nil
}

func (f fakeProjects) Delete(_ context.Context, id int64) error {
	if _, ok := f.s.projects[id]; !ok {
		return domain.ErrNotFound
	}
	delete(f.s.projects, id)
	return nil
}

func (f fakeProjects) GetMember(_ context.Context, projectID, userID int64) (domain.Member, error) {
	r, ok := f.s.members[[2]int64{projectID, userID}]
	if !ok {
		return domain.Member{}, domain.ErrNotFound
	}
	u := f.s.users[userID]
	return domain.Member{UserID: userID, Email: u.Email, Name: u.Name, Role: r}, nil
}

func (f fakeProjects) ListMembers(_ context.Context, projectID int64) ([]domain.Member, error) {
	var out []domain.Member
	for k, r := range f.s.members {
		if k[0] == projectID {
			u := f.s.users[k[1]]
			out = append(out, domain.Member{UserID: k[1], Email: u.Email, Name: u.Name, Role: r})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UserID < out[j].UserID })
	return out, nil
}

func (f fakeProjects) AddMember(_ context.Context, projectID, userID int64, role domain.Role) error {
	k := [2]int64{projectID, userID}
	if _, ok := f.s.members[k]; ok {
		return domain.ErrConflict
	}
	f.s.members[k] = role
	return nil
}

func (f fakeProjects) UpdateMemberRole(_ context.Context, projectID, userID int64, role domain.Role) error {
	k := [2]int64{projectID, userID}
	if _, ok := f.s.members[k]; !ok {
		return domain.ErrNotFound
	}
	f.s.members[k] = role
	return nil
}

func (f fakeProjects) RemoveMember(_ context.Context, projectID, userID int64) error {
	k := [2]int64{projectID, userID}
	if _, ok := f.s.members[k]; !ok {
		return domain.ErrNotFound
	}
	delete(f.s.members, k)
	return nil
}

func (f fakeProjects) CountOwners(_ context.Context, projectID int64) (int, error) {
	n := 0
	for k, r := range f.s.members {
		if k[0] == projectID && r == domain.RoleOwner {
			n++
		}
	}
	return n, nil
}

// ---- tasks ----

type fakeTasks struct{ s *store }

func (f fakeTasks) Get(_ context.Context, id int64) (domain.Task, error) {
	t, ok := f.s.tasks[id]
	if !ok {
		return domain.Task{}, domain.ErrNotFound
	}
	return t, nil
}

func (f fakeTasks) Create(_ context.Context, projectID int64, title, desc string, createdBy int64) (domain.Task, error) {
	t := domain.Task{ID: f.s.id(), ProjectID: projectID, Title: title, Description: desc, Status: domain.StatusTodo, CreatedBy: createdBy}
	f.s.tasks[t.ID] = t
	return t, nil
}

func (f fakeTasks) UpdateContent(_ context.Context, id int64, title, desc *string) (domain.Task, error) {
	t := f.s.tasks[id]
	if title != nil {
		t.Title = *title
	}
	if desc != nil {
		t.Description = *desc
	}
	f.s.tasks[id] = t
	return t, nil
}

func (f fakeTasks) UpdateStatus(_ context.Context, id int64, st domain.TaskStatus) (domain.Task, error) {
	t := f.s.tasks[id]
	t.Status = st
	f.s.tasks[id] = t
	return t, nil
}

func (f fakeTasks) UpdateAssignee(_ context.Context, id int64, assignee *int64) (domain.Task, error) {
	t := f.s.tasks[id]
	t.AssigneeID = assignee
	f.s.tasks[id] = t
	return t, nil
}

func (f fakeTasks) Delete(_ context.Context, id int64) error {
	delete(f.s.tasks, id)
	return nil
}

func (f fakeTasks) Search(_ context.Context, flt domain.TaskFilter) ([]domain.Task, int, error) {
	f.s.lastFilter = flt
	var out []domain.Task
	for _, t := range f.s.tasks {
		if _, ok := f.s.members[[2]int64{t.ProjectID, flt.UserID}]; !ok {
			continue
		}
		if flt.ProjectID != nil && t.ProjectID != *flt.ProjectID {
			continue
		}
		if flt.Status != nil && t.Status != *flt.Status {
			continue
		}
		if flt.Query != "" && !strings.Contains(t.Title, flt.Query) && !strings.Contains(t.Description, flt.Query) {
			continue
		}
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, len(out), nil
}

// ---- comments ----

type fakeComments struct{ s *store }

func (f fakeComments) Create(_ context.Context, taskID, userID int64, body string) (domain.Comment, error) {
	c := domain.Comment{ID: f.s.id(), TaskID: taskID, UserID: userID, Body: body}
	f.s.comments[c.ID] = c
	return c, nil
}

func (f fakeComments) Get(_ context.Context, id int64) (domain.Comment, error) {
	c, ok := f.s.comments[id]
	if !ok {
		return domain.Comment{}, domain.ErrNotFound
	}
	return c, nil
}

func (f fakeComments) ListByTask(_ context.Context, taskID int64) ([]domain.Comment, error) {
	var out []domain.Comment
	for _, c := range f.s.comments {
		if c.TaskID == taskID {
			out = append(out, c)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

func (f fakeComments) UpdateBody(_ context.Context, id int64, body string) (domain.Comment, error) {
	c := f.s.comments[id]
	c.Body = body
	f.s.comments[id] = c
	return c, nil
}

func (f fakeComments) Delete(_ context.Context, id int64) error {
	delete(f.s.comments, id)
	return nil
}

// ---- infra ports ----

// fakeHasher は Compare の呼び出し回数を数える(存在しないメールでも比較が走ることの検証用)。
type fakeHasher struct{ compares int }

func (*fakeHasher) Hash(plain string) (string, error) { return "hashed:" + plain, nil }
func (h *fakeHasher) Compare(hash, plain string) error {
	h.compares++
	if hash != "hashed:"+plain {
		return errors.New("mismatch")
	}
	return nil
}

var fakeExpiry = time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)

type fakeTokens struct{}

func (fakeTokens) Issue(userID int64) (string, time.Time, error) {
	return fmt.Sprintf("token-%d", userID), fakeExpiry, nil
}

func (fakeTokens) Verify(token string) (int64, error) {
	rest, ok := strings.CutPrefix(token, "token-")
	if !ok {
		return 0, errors.New("invalid token")
	}
	return strconv.ParseInt(rest, 10, 64)
}
