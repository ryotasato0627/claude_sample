package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"taskapp/backend/internal/handler/openapi"
)

// Handler は OpenAPI から生成された ServerInterface を実装する。
// 各エンドポイントは auth.go / project.go / task.go / comment.go にある。
type Handler struct {
	d Deps
}

var _ openapi.ServerInterface = (*Handler)(nil)

// New は依存を受け取って Handler を返す(interface を受け取り、具体型を返す)。
func New(d Deps) *Handler {
	return &Handler{d: d}
}

// GetHealth は GET /api/health。
func (h *Handler) GetHealth(c *gin.Context) {
	if err := h.d.DB.PingContext(c.Request.Context()); err != nil {
		c.JSON(http.StatusServiceUnavailable, openapi.Health{Status: openapi.Unavailable})
		return
	}
	c.JSON(http.StatusOK, openapi.Health{Status: openapi.Ok})
}
