package handler

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"

	"taskapp/backend/internal/handler/openapi"
)

// Pinger は疎通確認に必要な最小限の依存。handler 側で定義し、*sql.DB などが満たす。
type Pinger interface {
	PingContext(ctx context.Context) error
}

// Handler は OpenAPI から生成された ServerInterface を実装する。
type Handler struct {
	db Pinger
}

var _ openapi.ServerInterface = (*Handler)(nil)

// New は依存を受け取って Handler を返す(interface を受け取り、具体型を返す)。
func New(db Pinger) *Handler {
	return &Handler{db: db}
}

// GetHealth は GET /api/health。
func (h *Handler) GetHealth(c *gin.Context) {
	if err := h.db.PingContext(c.Request.Context()); err != nil {
		c.JSON(http.StatusServiceUnavailable, openapi.Health{Status: openapi.Unavailable})
		return
	}
	c.JSON(http.StatusOK, openapi.Health{Status: openapi.Ok})
}
