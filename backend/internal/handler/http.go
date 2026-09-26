package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"taskapp/backend/internal/domain"
	"taskapp/backend/internal/handler/openapi"
)

const (
	userIDKey    = "userID"
	maxBodyBytes = 1 << 20 // 1 MiB
)

// publicPaths は認証を必要としないルート(api/openapi.yaml の `security: []` と一致させる)。
// それ以外はすべて Bearer トークンが必要。router_test.go が、全ルートについてこの一致を検査する。
var publicPaths = map[string]bool{
	"/api/health":        true,
	"/api/auth/register": true,
	"/api/auth/login":    true,
}

// authMiddleware は、公開ルート以外で Bearer トークンを検証し、ユーザー ID をコンテキストに置く。
func authMiddleware(a Authenticator) openapi.MiddlewareFunc {
	return func(c *gin.Context) {
		if publicPaths[c.FullPath()] {
			return
		}
		scheme, token, ok := strings.Cut(c.GetHeader("Authorization"), " ")
		if !ok || !strings.EqualFold(scheme, "Bearer") || strings.TrimSpace(token) == "" {
			unauthorized(c)
			return
		}
		userID, err := a.Authenticate(c.Request.Context(), strings.TrimSpace(token))
		if err != nil {
			unauthorized(c)
			return
		}
		c.Set(userIDKey, userID)
	}
}

func unauthorized(c *gin.Context) {
	c.Header("WWW-Authenticate", "Bearer")
	writeError(c, domain.ErrUnauthorized)
	c.Abort()
}

// currentUser は認証済みユーザーの ID を返す(認証ミドルウェアが設定済みの前提)。
func currentUser(c *gin.Context) int64 {
	return c.GetInt64(userIDKey)
}

func limitBody(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
	c.Next()
}

// ---- エラー応答 ----

func writeJSONError(c *gin.Context, status int, code, message string) {
	c.JSON(status, openapi.Error{Code: code, Message: message})
}

func badRequest(c *gin.Context, message string) {
	writeJSONError(c, http.StatusBadRequest, "bad_request", message)
}

// writeError は、service / domain のエラーを HTTP 応答へ対応づける。
// 想定外のエラーは内容を返さず、ログ(gin のエラー記録)にのみ残す。
func writeError(c *gin.Context, err error) {
	var ve *domain.ValidationError
	switch {
	case errors.As(err, &ve):
		writeJSONError(c, http.StatusUnprocessableEntity, "validation_error", ve.Message)
	case errors.Is(err, domain.ErrUnauthorized):
		writeJSONError(c, http.StatusUnauthorized, "unauthorized", "authentication required")
	case errors.Is(err, domain.ErrForbidden):
		writeJSONError(c, http.StatusForbidden, "forbidden", "you do not have permission to perform this action")
	case errors.Is(err, domain.ErrNotFound):
		writeJSONError(c, http.StatusNotFound, "not_found", "resource not found")
	case errors.Is(err, domain.ErrLastOwner):
		writeJSONError(c, http.StatusConflict, "conflict", "the last owner cannot be demoted or removed")
	case errors.Is(err, domain.ErrConflict):
		writeJSONError(c, http.StatusConflict, "conflict", "the resource already exists or conflicts with its current state")
	default:
		_ = c.Error(err)
		writeJSONError(c, http.StatusInternalServerError, "internal_error", "internal server error")
	}
}

// bindJSON はリクエストボディを JSON として読み込む。失敗したら 400 を返して false を返す。
func bindJSON(c *gin.Context, dst any) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			writeJSONError(c, http.StatusRequestEntityTooLarge, "payload_too_large", fmt.Sprintf("request body must be at most %d bytes", maxBodyBytes))
			return false
		}
		badRequest(c, "request body must be valid JSON of the expected shape")
		return false
	}
	return true
}

// ---- domain → API の変換 ----

func toUser(u domain.User) openapi.User {
	return openapi.User{Id: u.ID, Email: openapi_types.Email(u.Email), Name: u.Name, CreatedAt: u.CreatedAt}
}

func toProject(p domain.ProjectWithRole) openapi.Project {
	return openapi.Project{Id: p.ID, Name: p.Name, Description: p.Description, Role: openapi.Role(p.Role), CreatedAt: p.CreatedAt}
}

func toMember(m domain.Member) openapi.Member {
	return openapi.Member{UserId: m.UserID, Email: m.Email, Name: m.Name, Role: openapi.Role(m.Role)}
}

func toTask(t domain.Task) openapi.Task {
	return openapi.Task{
		Id: t.ID, ProjectId: t.ProjectID, Title: t.Title, Description: t.Description,
		Status: openapi.TaskStatus(t.Status), AssigneeId: t.AssigneeID, CreatedBy: t.CreatedBy,
		CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt,
	}
}

func toComment(c domain.Comment) openapi.Comment {
	return openapi.Comment{Id: c.ID, TaskId: c.TaskID, UserId: c.UserID, Body: c.Body, CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt}
}

func mapSlice[S, T any](in []S, f func(S) T) []T {
	out := make([]T, 0, len(in)) // 空でも null ではなく [] にする
	for _, v := range in {
		out = append(out, f(v))
	}
	return out
}

// taskFilter は検索系のクエリパラメータを domain.TaskFilter に変換する。値の検証は service が行う。
func taskFilter(q *string, status *openapi.TaskStatus, assigneeID *int64, limit, offset *int) domain.TaskFilter {
	f := domain.TaskFilter{AssigneeID: assigneeID}
	if q != nil {
		f.Query = *q
	}
	if status != nil {
		s := domain.TaskStatus(*status)
		f.Status = &s
	}
	if limit != nil {
		f.Limit = *limit
	}
	if offset != nil {
		f.Offset = *offset
	}
	return f
}

func toTaskList(tasks []domain.Task, total int, f domain.TaskFilter) openapi.TaskList {
	limit := f.Limit
	if limit == 0 {
		limit = domain.DefaultPageLimit
	}
	return openapi.TaskList{Items: mapSlice(tasks, toTask), Total: total, Limit: limit, Offset: f.Offset}
}
