package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"taskapp/backend/internal/handler/openapi"
)

// Register は POST /api/auth/register。
func (h *Handler) Register(c *gin.Context) {
	var body openapi.RegisterRequest
	if !bindJSON(c, &body) {
		return
	}
	u, err := h.d.Auth.Register(c.Request.Context(), body.Email, body.Name, body.Password)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toUser(u))
}

// Login は POST /api/auth/login。
func (h *Handler) Login(c *gin.Context) {
	var body openapi.LoginRequest
	if !bindJSON(c, &body) {
		return
	}
	u, token, expiresAt, err := h.d.Auth.Login(c.Request.Context(), body.Email, body.Password)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, openapi.LoginResponse{Token: token, ExpiresAt: expiresAt, User: toUser(u)})
}
