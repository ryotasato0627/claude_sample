package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"taskapp/backend/internal/testutil/pgtest"
)

// 実 DB を使い、HTTP から DB までの全体(認証 → 権限 → 永続化)を通して検証する。
// 個別のルールは各層のテストで網羅しているので、ここでは「配線が正しいこと」と主要なシナリオを確認する。

type api struct {
	t *testing.T
	r *gin.Engine
}

// call はリクエストを送り、ステータスと JSON(object / array)を返す。
func (a *api) call(method, path, token string, body any) (int, any) {
	a.t.Helper()
	var rd *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rd)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	a.r.ServeHTTP(w, req)

	var v any
	if w.Body.Len() > 0 {
		if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
			a.t.Fatalf("%s %s: response is not JSON: %v\n%s", method, path, err, w.Body.String())
		}
	}
	return w.Code, v
}

// expect は期待するステータスを検証し、レスポンスを返す。
func (a *api) expect(want int, method, path, token string, body any) any {
	a.t.Helper()
	got, v := a.call(method, path, token, body)
	if got != want {
		a.t.Fatalf("%s %s: status = %d, want %d (body: %v)", method, path, got, want, v)
	}
	return v
}

func obj(v any) map[string]any { return v.(map[string]any) }

func idOf(v any) int64 { return int64(obj(v)["id"].(float64)) }

func (a *api) registerAndLogin(name string) (token string, id int64) {
	a.t.Helper()
	email := name + "@example.com"
	u := a.expect(201, "POST", "/api/auth/register", "", map[string]any{"email": email, "name": name, "password": "password123"})
	res := obj(a.expect(200, "POST", "/api/auth/login", "", map[string]any{"email": email, "password": "password123"}))
	return res["token"].(string), idOf(u)
}

func TestE2E(t *testing.T) {
	db := pgtest.New(t)
	r, err := newRouter(db, "e2e-secret-0123456789", bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	a := &api{t: t, r: r}

	t.Run("ヘルスチェックは認証不要", func(t *testing.T) {
		if got := obj(a.expect(200, "GET", "/api/health", "", nil)); got["status"] != "ok" {
			t.Errorf("health = %v", got)
		}
	})

	// ---- ユーザー登録・ログイン ----
	alice, aliceID := a.registerAndLogin("alice")
	bob, bobID := a.registerAndLogin("bob")
	carol, carolID := a.registerAndLogin("carol")
	dave, daveID := a.registerAndLogin("dave") // どのプロジェクトにも所属しない

	t.Run("登録・ログインの異常系", func(t *testing.T) {
		a.expect(409, "POST", "/api/auth/register", "", map[string]any{"email": "ALICE@example.com", "name": "x", "password": "password123"})
		a.expect(422, "POST", "/api/auth/register", "", map[string]any{"email": "x@example.com", "name": "x", "password": "short"})
		a.expect(422, "POST", "/api/auth/register", "", map[string]any{"email": "not-an-email", "name": "x", "password": "password123"})
		// パスワードの下限は文字数(3 文字・9 バイトは不可)、NUL 文字は 500 ではなく 422
		a.expect(422, "POST", "/api/auth/register", "", map[string]any{"email": "mb@example.com", "name": "x", "password": "あいう"})
		a.expect(422, "POST", "/api/auth/register", "", map[string]any{"email": "nul@example.com", "name": "a\u0000b", "password": "password123"})
		a.expect(401, "POST", "/api/auth/login", "", map[string]any{"email": "alice@example.com", "password": "wrong-password"})
		a.expect(401, "POST", "/api/auth/login", "", map[string]any{"email": "nobody@example.com", "password": "password123"})

		res := obj(a.expect(200, "POST", "/api/auth/login", "", map[string]any{"email": "Alice@Example.com", "password": "password123"}))
		if res["token"] == "" || res["expiresAt"] == "" || obj(res["user"])["email"] != "alice@example.com" {
			t.Errorf("login response = %v", res)
		}
		if _, leaked := obj(res["user"])["passwordHash"]; leaked {
			t.Error("password hash must not be returned")
		}
	})

	t.Run("トークンがないと 401(パラメータが不正でも、認証が先)", func(t *testing.T) {
		a.expect(401, "GET", "/api/projects", "", nil)
		a.expect(401, "GET", "/api/projects", "garbage", nil)
		a.expect(401, "GET", "/api/projects/abc", "", nil)
		a.expect(401, "GET", "/api/tasks/search?limit=abc", "", nil)
	})

	// ---- プロジェクト・メンバー ----
	project := obj(a.expect(201, "POST", "/api/projects", alice, map[string]any{"name": "Team", "description": "d"}))
	pid := int64(project["id"].(float64))
	pPath := fmt.Sprintf("/api/projects/%d", pid)
	if project["role"] != "owner" {
		t.Fatalf("creator role = %v, want owner", project["role"])
	}

	t.Run("メンバー管理", func(t *testing.T) {
		a.expect(201, "POST", pPath+"/members", alice, map[string]any{"email": "bob@example.com", "role": "member"})
		a.expect(201, "POST", pPath+"/members", alice, map[string]any{"email": "carol@example.com", "role": "viewer"})
		a.expect(409, "POST", pPath+"/members", alice, map[string]any{"email": "bob@example.com", "role": "member"})
		a.expect(422, "POST", pPath+"/members", alice, map[string]any{"email": "nobody@example.com", "role": "member"})
		a.expect(422, "POST", pPath+"/members", alice, map[string]any{"email": "dave@example.com", "role": "admin"})
		a.expect(403, "POST", pPath+"/members", bob, map[string]any{"email": "dave@example.com", "role": "member"})
		a.expect(404, "POST", pPath+"/members", dave, map[string]any{"email": "dave@example.com", "role": "member"})

		members := a.expect(200, "GET", pPath+"/members", carol, nil).([]any)
		if len(members) != 3 {
			t.Errorf("members = %v, want 3", members)
		}
	})

	t.Run("プロジェクトの参照範囲", func(t *testing.T) {
		if got := a.expect(200, "GET", "/api/projects", bob, nil).([]any); len(got) != 1 || obj(got[0])["role"] != "member" {
			t.Errorf("bob's projects = %v", got)
		}
		if got := a.expect(200, "GET", "/api/projects", dave, nil).([]any); len(got) != 0 {
			t.Errorf("dave's projects = %v, want none", got)
		}
		a.expect(404, "GET", pPath, dave, nil) // 非メンバーには存在を知らせない
		a.expect(403, "PATCH", pPath, bob, map[string]any{"name": "x"})
		a.expect(200, "PATCH", pPath, alice, map[string]any{"description": "updated"})
	})

	// ---- Task ----
	task := obj(a.expect(201, "POST", pPath+"/tasks", bob, map[string]any{"title": "Write docs", "description": "for the API"}))
	tid := int64(task["id"].(float64))
	tPath := fmt.Sprintf("/api/tasks/%d", tid)
	if task["status"] != "todo" || task["assigneeId"] != nil || int64(task["createdBy"].(float64)) != bobID {
		t.Fatalf("created task = %v", task)
	}

	t.Run("Task の権限", func(t *testing.T) {
		a.expect(403, "POST", pPath+"/tasks", carol, map[string]any{"title": "x"}) // viewer は作れない
		a.expect(422, "POST", pPath+"/tasks", bob, map[string]any{"title": "  "})
		a.expect(404, "POST", pPath+"/tasks", dave, map[string]any{"title": "x"})
		a.expect(200, "GET", tPath, carol, nil) // viewer は閲覧できる
		a.expect(404, "GET", tPath, dave, nil)
		a.expect(404, "GET", "/api/tasks/999999", alice, nil)
		a.expect(403, "PATCH", tPath, carol, map[string]any{"title": "x"})
		a.expect(404, "PATCH", tPath, dave, map[string]any{"title": "x"})
	})

	t.Run("Task の更新は指定した項目だけ", func(t *testing.T) {
		got := obj(a.expect(200, "PATCH", tPath, bob, map[string]any{"title": "Write API docs"}))
		if got["title"] != "Write API docs" || got["description"] != "for the API" {
			t.Errorf("after title-only patch: %v", got)
		}
		got = obj(a.expect(200, "PATCH", tPath, bob, map[string]any{"description": ""}))
		if got["title"] != "Write API docs" || got["description"] != "" {
			t.Errorf("after clearing description: %v", got)
		}
		a.expect(200, "PATCH", tPath, bob, map[string]any{"description": "for the API"})
	})

	t.Run("ステータス変更(遷移は自由)", func(t *testing.T) {
		for _, st := range []string{"in_progress", "done", "todo", "done"} {
			if got := obj(a.expect(200, "PATCH", tPath+"/status", bob, map[string]any{"status": st})); got["status"] != st {
				t.Errorf("status = %v, want %s", got["status"], st)
			}
		}
		a.expect(422, "PATCH", tPath+"/status", bob, map[string]any{"status": "blocked"})
		a.expect(403, "PATCH", tPath+"/status", carol, map[string]any{"status": "todo"})
		a.expect(404, "PATCH", tPath+"/status", dave, map[string]any{"status": "todo"})
	})

	t.Run("担当者変更", func(t *testing.T) {
		if got := obj(a.expect(200, "PATCH", tPath+"/assignee", bob, map[string]any{"assigneeId": carolID})); int64(got["assigneeId"].(float64)) != carolID {
			t.Errorf("assignee = %v (viewer も担当者にできる)", got["assigneeId"])
		}
		a.expect(422, "PATCH", tPath+"/assignee", bob, map[string]any{"assigneeId": 999999}) // 存在しないユーザー
		a.expect(403, "PATCH", tPath+"/assignee", carol, map[string]any{"assigneeId": bobID})
		if got := obj(a.expect(200, "PATCH", tPath+"/assignee", bob, map[string]any{"assigneeId": nil})); got["assigneeId"] != nil {
			t.Errorf("assignee = %v, want null (解除)", got["assigneeId"])
		}
		// dave は登録済みだが、このプロジェクトのメンバーではないので担当者にできない
		a.expect(422, "PATCH", tPath+"/assignee", bob, map[string]any{"assigneeId": daveID})
		// assigneeId の省略は、null(解除)とは別。黙って担当が外れないよう 422 にする
		a.expect(200, "PATCH", tPath+"/assignee", bob, map[string]any{"assigneeId": bobID})
		a.expect(422, "PATCH", tPath+"/assignee", bob, map[string]any{})
		a.expect(400, "PATCH", tPath+"/assignee", bob, map[string]any{"assigneeId": "abc"})
		if got := obj(a.expect(200, "GET", tPath, bob, nil)); got["assigneeId"] == nil {
			t.Error("assignee was cleared by a request that omitted assigneeId")
		}
		a.expect(200, "PATCH", tPath+"/assignee", bob, map[string]any{"assigneeId": nil})
	})

	t.Run("NUL 文字は 500 ではなく 422", func(t *testing.T) {
		a.expect(422, "POST", "/api/projects", alice, map[string]any{"name": "a\u0000b"})
		a.expect(422, "PATCH", tPath, bob, map[string]any{"description": "a\u0000b"})
		a.expect(422, "GET", "/api/tasks/search?q=a%00b", bob, nil)
	})

	// ---- コメント ----
	bobComment := obj(a.expect(201, "POST", tPath+"/comments", bob, map[string]any{"body": "started"}))
	aliceComment := obj(a.expect(201, "POST", tPath+"/comments", alice, map[string]any{"body": "thanks"}))
	bcPath := fmt.Sprintf("/api/comments/%d", int64(bobComment["id"].(float64)))
	acPath := fmt.Sprintf("/api/comments/%d", int64(aliceComment["id"].(float64)))

	t.Run("コメントの権限", func(t *testing.T) {
		a.expect(403, "POST", tPath+"/comments", carol, map[string]any{"body": "x"})
		a.expect(404, "POST", tPath+"/comments", dave, map[string]any{"body": "x"})
		a.expect(422, "POST", tPath+"/comments", bob, map[string]any{"body": ""})
		if got := a.expect(200, "GET", tPath+"/comments", carol, nil).([]any); len(got) != 2 || obj(got[0])["body"] != "started" {
			t.Errorf("comments = %v, want [started thanks]", got)
		}
		a.expect(404, "GET", tPath+"/comments", dave, nil)

		a.expect(403, "PATCH", acPath, bob, map[string]any{"body": "hijack"}) // member は他人のコメントを編集できない
		a.expect(403, "DELETE", acPath, bob, nil)
		a.expect(403, "PATCH", bcPath, carol, map[string]any{"body": "x"}) // viewer は不可
		a.expect(404, "PATCH", bcPath, dave, map[string]any{"body": "x"})
		if got := obj(a.expect(200, "PATCH", bcPath, bob, map[string]any{"body": "edited"})); got["body"] != "edited" {
			t.Errorf("comment = %v", got)
		}
		a.expect(204, "DELETE", bcPath, alice, nil) // owner は他人のコメントも削除できる
		a.expect(404, "DELETE", bcPath, alice, nil)
	})

	// ---- 検索 ----
	t.Run("Task 検索", func(t *testing.T) {
		a.expect(201, "POST", pPath+"/tasks", alice, map[string]any{"title": "Fix 100% bug"})
		a.expect(201, "POST", pPath+"/tasks", alice, map[string]any{"title": "Plan release"})

		search := func(token, query string) map[string]any {
			return obj(a.expect(200, "GET", "/api/tasks/search"+query, token, nil))
		}
		if got := search(bob, ""); got["total"] != float64(3) {
			t.Errorf("total = %v, want 3", got["total"])
		}
		if got := search(bob, "?q=DOCS"); got["total"] != float64(1) {
			t.Errorf("q=DOCS: %v", got)
		}
		if got := search(bob, "?q=%25"); got["total"] != float64(1) { // "%" は文字そのものとして検索される
			t.Errorf("q=%%: total = %v, want 1 (LIKE のメタ文字が効いている)", got["total"])
		}
		if got := search(bob, "?status=done"); got["total"] != float64(1) {
			t.Errorf("status=done: %v", got)
		}
		page := search(bob, "?limit=2&offset=0")
		if len(page["items"].([]any)) != 2 || page["total"] != float64(3) || page["limit"] != float64(2) {
			t.Errorf("page = %v", page)
		}
		a.expect(422, "GET", "/api/tasks/search?limit=101", bob, nil)
		a.expect(422, "GET", "/api/tasks/search?limit=0", bob, nil) // 0 は既定値にならず、範囲外
		a.expect(422, "GET", "/api/tasks/search?offset=-1", bob, nil)
		a.expect(422, "GET", "/api/tasks/search?offset=2147483648", bob, nil) // int32 を超える(以前は 500)
		a.expect(422, "GET", "/api/tasks/search?offset=4294967296", bob, nil) // 以前は offset 0 として動いていた
		a.expect(200, "GET", "/api/tasks/search?offset=2147483647", bob, nil)
		a.expect(422, "GET", "/api/tasks/search?status=blocked", bob, nil)

		// 非メンバーには何も見えない(プロジェクトを指定しても)
		if got := search(dave, ""); got["total"] != float64(0) {
			t.Errorf("dave sees %v, want nothing", got)
		}
		if got := search(dave, fmt.Sprintf("?projectId=%d", pid)); got["total"] != float64(0) {
			t.Errorf("dave with projectId sees %v, want nothing", got)
		}
		a.expect(404, "GET", pPath+"/tasks", dave, nil)
		if got := obj(a.expect(200, "GET", pPath+"/tasks?status=todo", carol, nil)); got["total"] != float64(2) {
			t.Errorf("project tasks(todo) = %v, want 2", got)
		}
	})

	// ---- ロール変更・削除の整合性 ----
	t.Run("最後の owner は降格・削除できない", func(t *testing.T) {
		a.expect(409, "PATCH", fmt.Sprintf("%s/members/%d", pPath, aliceID), alice, map[string]any{"role": "member"})
		a.expect(409, "DELETE", fmt.Sprintf("%s/members/%d", pPath, aliceID), alice, nil)
		a.expect(404, "DELETE", fmt.Sprintf("%s/members/%d", pPath, 999999), alice, nil)
	})

	t.Run("メンバー削除で、その人の担当が解除される", func(t *testing.T) {
		a.expect(200, "PATCH", tPath+"/assignee", bob, map[string]any{"assigneeId": carolID})
		a.expect(204, "DELETE", fmt.Sprintf("%s/members/%d", pPath, carolID), alice, nil)
		if got := obj(a.expect(200, "GET", tPath, alice, nil)); got["assigneeId"] != nil {
			t.Errorf("assignee = %v, want null after the member was removed", got["assigneeId"])
		}
		a.expect(404, "GET", tPath, carol, nil) // 外された人はもう見られない
	})

	t.Run("owner を増やしてから降格できる", func(t *testing.T) {
		a.expect(200, "PATCH", fmt.Sprintf("%s/members/%d", pPath, bobID), alice, map[string]any{"role": "owner"})
		a.expect(200, "PATCH", fmt.Sprintf("%s/members/%d", pPath, aliceID), bob, map[string]any{"role": "viewer"})
		a.expect(403, "PATCH", pPath, alice, map[string]any{"name": "x"}) // alice はもう viewer
	})

	// ---- 削除 ----
	t.Run("Task 削除は owner のみ。コメントも消える", func(t *testing.T) {
		a.expect(403, "DELETE", tPath, alice, nil) // viewer
		a.expect(204, "DELETE", tPath, bob, nil)
		a.expect(404, "GET", tPath, bob, nil)
		a.expect(404, "PATCH", acPath, bob, map[string]any{"body": "x"}) // コメントも消えている
	})

	t.Run("プロジェクト削除は owner のみ。配下も消える", func(t *testing.T) {
		a.expect(403, "DELETE", pPath, alice, nil)
		a.expect(404, "DELETE", pPath, dave, nil)
		a.expect(204, "DELETE", pPath, bob, nil)
		a.expect(404, "GET", pPath, bob, nil)
		if got := obj(a.expect(200, "GET", "/api/tasks/search", bob, nil)); got["total"] != float64(0) {
			t.Errorf("tasks remain after project deletion: %v", got)
		}
	})
}
