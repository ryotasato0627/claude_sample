package handler_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"taskapp/backend/internal/domain"
	"taskapp/backend/internal/handler"
)

func init() { gin.SetMode(gin.TestMode) }

// ---- fakes: 使わないメソッドは nil の interface が埋め込まれており、呼ばれると panic → 500 になる ----

// "user-<id>" というトークンを、そのユーザー ID として認証する。
type fakeAuth struct {
	handler.AuthService
	registered bool
}

func (fakeAuth) Authenticate(_ context.Context, token string) (int64, error) {
	var id int64
	if _, err := fmt.Sscanf(token, "user-%d", &id); err != nil {
		return 0, domain.ErrUnauthorized
	}
	return id, nil
}

func (f *fakeAuth) Register(_ context.Context, email, name, _ string) (domain.User, error) {
	f.registered = true
	return domain.User{ID: 1, Email: email, Name: name, PasswordHash: "SECRET-HASH"}, nil
}

func (fakeAuth) Login(_ context.Context, email, _ string) (domain.User, string, time.Time, error) {
	return domain.User{ID: 1, Email: email, Name: "A", PasswordHash: "SECRET-HASH"}, "jwt-token", time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC), nil
}

type fakeProjects struct {
	handler.ProjectService
	err   error
	actor int64
	name  *string
}

func (f *fakeProjects) List(_ context.Context, actor int64) ([]domain.ProjectWithRole, error) {
	f.actor = actor
	return nil, f.err
}

func (f *fakeProjects) Get(_ context.Context, actor, _ int64) (domain.ProjectWithRole, error) {
	f.actor = actor
	return domain.ProjectWithRole{}, f.err
}

func (f *fakeProjects) Create(_ context.Context, actor int64, name, _ string) (domain.ProjectWithRole, error) {
	f.actor, f.name = actor, &name
	return domain.ProjectWithRole{Project: domain.Project{ID: 9, Name: name}, Role: domain.RoleOwner}, f.err
}

func (f *fakeProjects) Delete(context.Context, int64, int64) error { return f.err }

func (f *fakeProjects) ListMembers(context.Context, int64, int64) ([]domain.Member, error) {
	return nil, f.err
}

type fakeTasks struct {
	handler.TaskService
	filter    domain.TaskFilter
	projectID int64
	title     *string
	desc      *string
	assignee  *int64
	called    bool
}

func (f *fakeTasks) Search(_ context.Context, _ int64, flt domain.TaskFilter) ([]domain.Task, int, error) {
	f.filter, f.called = flt, true
	return nil, 0, nil
}

func (f *fakeTasks) ListByProject(_ context.Context, _, projectID int64, flt domain.TaskFilter) ([]domain.Task, int, error) {
	f.filter, f.projectID, f.called = flt, projectID, true
	return nil, 0, nil
}

func (f *fakeTasks) Update(_ context.Context, _, id int64, title, desc *string) (domain.Task, error) {
	f.title, f.desc = title, desc
	return domain.Task{ID: id}, nil
}

func (f *fakeTasks) UpdateAssignee(_ context.Context, _, id int64, assignee *int64) (domain.Task, error) {
	f.assignee = assignee
	return domain.Task{ID: id, AssigneeID: assignee}, nil
}

type fakeComments struct{ handler.CommentService }

func (fakeComments) List(context.Context, int64, int64) ([]domain.Comment, error) { return nil, nil }

type fakePinger struct{ err error }

func (f fakePinger) PingContext(context.Context) error { return f.err }

type rig struct {
	r        *gin.Engine
	auth     *fakeAuth
	projects *fakeProjects
	tasks    *fakeTasks
}

func newRig() *rig {
	rg := &rig{auth: &fakeAuth{}, projects: &fakeProjects{}, tasks: &fakeTasks{}}
	h := handler.New(handler.Deps{DB: fakePinger{}, Auth: rg.auth, Projects: rg.projects, Tasks: rg.tasks, Comments: fakeComments{}})
	rg.r = handler.NewRouter(h, rg.auth)
	return rg
}

func (rg *rig) do(method, path, body, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	rg.r.ServeHTTP(w, req)
	return w
}

type errBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("response is not valid JSON: %v\nbody: %s", err, w.Body.String())
	}
	return v
}

func TestHealth(t *testing.T) {
	for name, tt := range map[string]struct {
		pingErr    error
		wantStatus int
		wantBody   string
	}{
		"db ok":   {nil, http.StatusOK, `{"status":"ok"}`},
		"db down": {errors.New("down"), http.StatusServiceUnavailable, `{"status":"unavailable"}`},
	} {
		t.Run(name, func(t *testing.T) {
			rg := newRig()
			h := handler.New(handler.Deps{DB: fakePinger{err: tt.pingErr}})
			w := (&rig{r: handler.NewRouter(h, rg.auth)}).do(http.MethodGet, "/api/health", "", "") // 認証不要
			if w.Code != tt.wantStatus || w.Body.String() != tt.wantBody {
				t.Errorf("status=%d body=%s, want %d %s", w.Code, w.Body.String(), tt.wantStatus, tt.wantBody)
			}
		})
	}
}

func TestBearerTokenHandling(t *testing.T) {
	rg := newRig()

	t.Run("スキームの大文字小文字は区別しない。ユーザー ID が service に渡る", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
		req.Header.Set("Authorization", "bearer user-7")
		w := httptest.NewRecorder()
		rg.r.ServeHTTP(w, req)
		if w.Code != http.StatusOK || rg.projects.actor != 7 {
			t.Errorf("status=%d actor=%d, want 200 and actor 7", w.Code, rg.projects.actor)
		}
	})
	t.Run("401 は WWW-Authenticate と JSON エラーを返す", func(t *testing.T) {
		w := rg.do(http.MethodGet, "/api/projects", "", "garbage")
		if w.Code != http.StatusUnauthorized || w.Header().Get("WWW-Authenticate") != "Bearer" {
			t.Errorf("status=%d www-authenticate=%q", w.Code, w.Header().Get("WWW-Authenticate"))
		}
		if b := decode[errBody](t, w); b.Code != "unauthorized" {
			t.Errorf("code = %q, want unauthorized", b.Code)
		}
	})
}

func TestErrorMapping(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
	}{
		{"検証エラー", domain.Invalid("name is required"), 422, "validation_error"},
		{"未認証", domain.ErrUnauthorized, 401, "unauthorized"},
		{"権限なし", domain.ErrForbidden, 403, "forbidden"},
		{"存在しない / 非メンバー", domain.ErrNotFound, 404, "not_found"},
		{"競合", domain.ErrConflict, 409, "conflict"},
		{"最後の owner", domain.ErrLastOwner, 409, "conflict"},
		{"ラップされた NotFound", fmt.Errorf("load project: %w", domain.ErrNotFound), 404, "not_found"},
		{"ラップされた検証エラー", fmt.Errorf("x: %w", domain.Invalid("bad")), 422, "validation_error"},
		{"想定外のエラー", errors.New("connection refused: password=SECRET"), 500, "internal_error"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rg := newRig()
			rg.projects.err = tt.err
			w := rg.do(http.MethodGet, "/api/projects/1", "", "user-1")
			if w.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", w.Code, tt.wantStatus)
			}
			b := decode[errBody](t, w)
			if b.Code != tt.wantCode || b.Message == "" {
				t.Errorf("body = %+v, want code %s and a message", b, tt.wantCode)
			}
			if strings.Contains(w.Body.String(), "SECRET") {
				t.Errorf("internal error details must not be exposed: %s", w.Body.String())
			}
		})
	}

	t.Run("最後の owner のメッセージが伝わる", func(t *testing.T) {
		rg := newRig()
		rg.projects.err = domain.ErrLastOwner
		w := rg.do(http.MethodGet, "/api/projects/1", "", "user-1")
		if b := decode[errBody](t, w); !strings.Contains(b.Message, "last owner") {
			t.Errorf("message = %q", b.Message)
		}
	})
}

func TestMalformedRequests(t *testing.T) {
	big := `{"name":"` + strings.Repeat("a", 2<<20) + `"}`
	tests := []struct {
		name, method, path, body string
		wantStatus               int
		wantCode                 string
	}{
		{"JSON の構文エラー", "POST", "/api/projects", `{"name":`, 400, "bad_request"},
		{"空のボディ", "POST", "/api/projects", "", 400, "bad_request"},
		{"型が違う", "POST", "/api/projects", `{"name": 123}`, 400, "bad_request"},
		{"巨大なボディ", "POST", "/api/projects", big, 413, "payload_too_large"},
		{"パスパラメータが数値でない", "GET", "/api/projects/abc", "", 400, "bad_request"},
		{"パスパラメータが int64 を超える", "GET", "/api/tasks/99999999999999999999", "", 400, "bad_request"},
		{"クエリパラメータが数値でない", "GET", "/api/tasks/search?limit=abc", "", 400, "bad_request"},
		{"存在しないルート", "GET", "/api/nope", "", 404, "not_found"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rg := newRig()
			w := rg.do(tt.method, tt.path, tt.body, "user-1")
			if w.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (body: %.200s)", w.Code, tt.wantStatus, w.Body.String())
			}
			if b := decode[errBody](t, w); b.Code != tt.wantCode {
				t.Errorf("code = %q, want %q", b.Code, tt.wantCode)
			}
		})
	}
}

func TestResponseShapes(t *testing.T) {
	rg := newRig()

	t.Run("空の一覧は null ではなく []", func(t *testing.T) {
		for _, path := range []string{"/api/projects", "/api/projects/1/members", "/api/tasks/1/comments"} {
			w := rg.do(http.MethodGet, path, "", "user-1")
			if w.Code != 200 || strings.TrimSpace(w.Body.String()) != "[]" {
				t.Errorf("%s: status=%d body=%s, want 200 []", path, w.Code, w.Body.String())
			}
		}
	})
	t.Run("作成は 201。呼び出しユーザーが渡る", func(t *testing.T) {
		w := rg.do(http.MethodPost, "/api/projects", `{"name":"P"}`, "user-5")
		if w.Code != 201 || rg.projects.actor != 5 || *rg.projects.name != "P" {
			t.Errorf("status=%d actor=%d", w.Code, rg.projects.actor)
		}
		if got := decode[map[string]any](t, w); got["role"] != "owner" || got["name"] != "P" {
			t.Errorf("body = %v", got)
		}
	})
	t.Run("削除は 204 でボディなし", func(t *testing.T) {
		w := rg.do(http.MethodDelete, "/api/projects/1", "", "user-1")
		if w.Code != 204 || w.Body.Len() != 0 {
			t.Errorf("status=%d body=%q", w.Code, w.Body.String())
		}
	})
	t.Run("登録: 201。パスワードハッシュはレスポンスに含まれない", func(t *testing.T) {
		w := rg.do(http.MethodPost, "/api/auth/register", `{"email":"a@example.com","name":"A","password":"password123"}`, "")
		if w.Code != 201 {
			t.Fatalf("status = %d", w.Code)
		}
		if strings.Contains(strings.ToLower(w.Body.String()), "secret-hash") || strings.Contains(w.Body.String(), "passwordHash") {
			t.Errorf("password hash leaked: %s", w.Body.String())
		}
	})
	t.Run("ログイン: トークン・期限・ユーザー。ハッシュは含まれない", func(t *testing.T) {
		w := rg.do(http.MethodPost, "/api/auth/login", `{"email":"a@example.com","password":"password123"}`, "")
		if w.Code != 200 {
			t.Fatalf("status = %d", w.Code)
		}
		got := decode[map[string]any](t, w)
		if got["token"] != "jwt-token" || got["expiresAt"] != "2030-01-01T00:00:00Z" {
			t.Errorf("body = %v", got)
		}
		if strings.Contains(w.Body.String(), "SECRET-HASH") {
			t.Errorf("password hash leaked: %s", w.Body.String())
		}
	})
}

func TestTaskQueryMapping(t *testing.T) {
	t.Run("検索: すべてのクエリが filter に渡り、limit/offset が応答に反映される", func(t *testing.T) {
		rg := newRig()
		w := rg.do(http.MethodGet, "/api/tasks/search?q=abc&status=done&assigneeId=5&projectId=3&limit=10&offset=20", "", "user-1")
		if w.Code != 200 {
			t.Fatalf("status = %d: %s", w.Code, w.Body.String())
		}
		f := rg.tasks.filter
		if f.Query != "abc" || f.Status == nil || *f.Status != domain.StatusDone ||
			f.AssigneeID == nil || *f.AssigneeID != 5 || f.ProjectID == nil || *f.ProjectID != 3 ||
			f.Limit != 10 || f.Offset != 20 {
			t.Errorf("filter = %+v", f)
		}
		got := decode[map[string]any](t, w)
		if got["limit"] != float64(10) || got["offset"] != float64(20) || got["total"] != float64(0) {
			t.Errorf("body = %v", got)
		}
		if items, ok := got["items"].([]any); !ok || len(items) != 0 {
			t.Errorf("items = %v, want []", got["items"])
		}
	})
	t.Run("limit 未指定なら既定値が応答に入る", func(t *testing.T) {
		rg := newRig()
		w := rg.do(http.MethodGet, "/api/tasks/search", "", "user-1")
		if got := decode[map[string]any](t, w); got["limit"] != float64(domain.DefaultPageLimit) {
			t.Errorf("limit = %v, want %d", got["limit"], domain.DefaultPageLimit)
		}
	})
	t.Run("/api/tasks/search は /api/tasks/{taskId} と衝突せず、search として扱われる", func(t *testing.T) {
		rg := newRig()
		rg.do(http.MethodGet, "/api/tasks/search", "", "user-1")
		if !rg.tasks.called {
			t.Error("search handler was not called")
		}
	})
	t.Run("プロジェクト内一覧: パスの projectId とクエリが渡る", func(t *testing.T) {
		rg := newRig()
		rg.do(http.MethodGet, "/api/projects/42/tasks?status=todo", "", "user-1")
		if rg.tasks.projectID != 42 || rg.tasks.filter.Status == nil || *rg.tasks.filter.Status != domain.StatusTodo {
			t.Errorf("projectID=%d filter=%+v", rg.tasks.projectID, rg.tasks.filter)
		}
	})
}

// 部分更新では「指定なし」と「空文字 / null を指定」を区別する。
func TestPartialUpdateSemantics(t *testing.T) {
	t.Run("title だけ指定: description は nil(変更しない)", func(t *testing.T) {
		rg := newRig()
		rg.do(http.MethodPatch, "/api/tasks/1", `{"title":"x"}`, "user-1")
		if rg.tasks.title == nil || *rg.tasks.title != "x" || rg.tasks.desc != nil {
			t.Errorf("title=%v desc=%v, want title=x desc=nil", rg.tasks.title, rg.tasks.desc)
		}
	})
	t.Run("description に空文字を指定: 空にする(nil ではない)", func(t *testing.T) {
		rg := newRig()
		rg.do(http.MethodPatch, "/api/tasks/1", `{"description":""}`, "user-1")
		if rg.tasks.desc == nil || *rg.tasks.desc != "" || rg.tasks.title != nil {
			t.Errorf("title=%v desc=%v, want title=nil desc=\"\"", rg.tasks.title, rg.tasks.desc)
		}
	})
	t.Run("assigneeId: 数値で指定、null で解除", func(t *testing.T) {
		rg := newRig()
		rg.do(http.MethodPatch, "/api/tasks/1/assignee", `{"assigneeId":5}`, "user-1")
		if rg.tasks.assignee == nil || *rg.tasks.assignee != 5 {
			t.Errorf("assignee = %v, want 5", rg.tasks.assignee)
		}
		rg.do(http.MethodPatch, "/api/tasks/1/assignee", `{"assigneeId":null}`, "user-1")
		if rg.tasks.assignee != nil {
			t.Errorf("assignee = %v, want nil (unassign)", *rg.tasks.assignee)
		}
	})
}
