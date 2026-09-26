package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"taskapp/backend/internal/domain"
	"taskapp/backend/internal/handler/openapi"
)

// 認証の要否は「OpenAPI の security」と「コードの publicPaths」の 2 か所に現れる。
// ずれると、認証が必要な API が無認証で公開される事故になるため、ここで突き合わせる。

type stubAuth struct{}

func (stubAuth) Authenticate(context.Context, string) (int64, error) {
	return 0, domain.ErrUnauthorized
}

var pathParam = regexp.MustCompile(`\{([^}]+)\}`)

func TestPublicPathsMatchOpenAPISpec(t *testing.T) {
	spec, err := openapi.GetSwagger()
	if err != nil {
		t.Fatal(err)
	}

	specPublic := map[string]bool{}
	specOps := map[string]bool{} // "METHOD /path" の集合
	for path, item := range spec.Paths.Map() {
		ginPath := pathParam.ReplaceAllString(path, ":$1")
		for method, op := range item.Operations() {
			specOps[method+" "+ginPath] = true
			// 操作に `security: []` があれば公開。無ければグローバルの security(bearerAuth)が適用される
			if op.Security != nil && len(*op.Security) == 0 {
				specPublic[ginPath] = true
			}
		}
	}

	for p := range publicPaths {
		if !specPublic[p] {
			t.Errorf("publicPaths has %s, but the OpenAPI spec requires authentication for it", p)
		}
	}
	for p := range specPublic {
		if !publicPaths[p] {
			t.Errorf("OpenAPI spec marks %s as public, but publicPaths does not", p)
		}
	}

	// 仕様にある操作と、実際に登録されたルートが一致していること
	r := NewRouter(New(Deps{}), stubAuth{})
	routes := map[string]bool{}
	for _, ri := range r.Routes() {
		routes[ri.Method+" "+ri.Path] = true
	}
	for op := range specOps {
		if !routes[op] {
			t.Errorf("operation %s is in the spec but not registered", op)
		}
	}
	for route := range routes {
		if !specOps[route] {
			t.Errorf("route %s is registered but not in the spec", route)
		}
	}
	if len(specOps) != 24 {
		t.Errorf("spec has %d operations, want 24 (health + 23 endpoints of chapter 4)", len(specOps))
	}
}

// 認証が必要なすべてのルートが、トークンなしで 401 を返す(handler に到達しない)。
func TestAllProtectedRoutesRejectMissingToken(t *testing.T) {
	r := NewRouter(New(Deps{}), stubAuth{}) // 依存が nil なので、handler に到達すれば panic → 500 になる
	checked := 0
	for _, ri := range r.Routes() {
		if publicPaths[ri.Path] {
			continue
		}
		path := regexp.MustCompile(`:[A-Za-z]+`).ReplaceAllString(ri.Path, "1")
		for name, header := range map[string]string{
			"ヘッダなし":          "",
			"Basic 認証":       "Basic dXNlcjpwYXNz",
			"トークンが空":         "Bearer ",
			"不正なトークン":        "Bearer not-a-valid-token",
			"スキームだけ":         "Bearer",
			"トークンだけ(スキームなし)": "some-token",
		} {
			req := httptest.NewRequest(ri.Method, path, strings.NewReader("{}"))
			if header != "" {
				req.Header.Set("Authorization", header)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != http.StatusUnauthorized {
				t.Errorf("%s %s (%s): status = %d, want 401", ri.Method, path, name, w.Code)
			}
		}
		checked++
	}
	if checked != 21 {
		t.Errorf("checked %d protected routes, want 21", checked)
	}
}
