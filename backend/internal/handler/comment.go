package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"taskapp/backend/internal/handler/openapi"
)

// ListComments は GET /api/tasks/{taskId}/comments。
func (h *Handler) ListComments(c *gin.Context, taskId openapi.TaskId) {
	cs, err := h.d.Comments.List(c.Request.Context(), currentUser(c), taskId)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, mapSlice(cs, toComment))
}

// CreateComment は POST /api/tasks/{taskId}/comments。
func (h *Handler) CreateComment(c *gin.Context, taskId openapi.TaskId) {
	var body openapi.CommentRequest
	if !bindJSON(c, &body) {
		return
	}
	cm, err := h.d.Comments.Create(c.Request.Context(), currentUser(c), taskId, body.Body)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toComment(cm))
}

// UpdateComment は PATCH /api/comments/{commentId}。
func (h *Handler) UpdateComment(c *gin.Context, commentId openapi.CommentId) {
	var body openapi.CommentRequest
	if !bindJSON(c, &body) {
		return
	}
	cm, err := h.d.Comments.Update(c.Request.Context(), currentUser(c), commentId, body.Body)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toComment(cm))
}

// DeleteComment は DELETE /api/comments/{commentId}。
func (h *Handler) DeleteComment(c *gin.Context, commentId openapi.CommentId) {
	if err := h.d.Comments.Delete(c.Request.Context(), currentUser(c), commentId); err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
