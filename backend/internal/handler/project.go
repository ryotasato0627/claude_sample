package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"taskapp/backend/internal/handler/openapi"
)

// ListProjects は GET /api/projects。
func (h *Handler) ListProjects(c *gin.Context) {
	ps, err := h.d.Projects.List(c.Request.Context(), currentUser(c))
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, mapSlice(ps, toProject))
}

// CreateProject は POST /api/projects。
func (h *Handler) CreateProject(c *gin.Context) {
	var body openapi.CreateProjectRequest
	if !bindJSON(c, &body) {
		return
	}
	desc := ""
	if body.Description != nil {
		desc = *body.Description
	}
	p, err := h.d.Projects.Create(c.Request.Context(), currentUser(c), body.Name, desc)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toProject(p))
}

// GetProject は GET /api/projects/{projectId}。
func (h *Handler) GetProject(c *gin.Context, projectId openapi.ProjectId) {
	p, err := h.d.Projects.Get(c.Request.Context(), currentUser(c), projectId)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toProject(p))
}

// UpdateProject は PATCH /api/projects/{projectId}。
func (h *Handler) UpdateProject(c *gin.Context, projectId openapi.ProjectId) {
	var body openapi.UpdateProjectRequest
	if !bindJSON(c, &body) {
		return
	}
	p, err := h.d.Projects.Update(c.Request.Context(), currentUser(c), projectId, body.Name, body.Description)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toProject(p))
}

// DeleteProject は DELETE /api/projects/{projectId}。
func (h *Handler) DeleteProject(c *gin.Context, projectId openapi.ProjectId) {
	if err := h.d.Projects.Delete(c.Request.Context(), currentUser(c), projectId); err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// ListMembers は GET /api/projects/{projectId}/members。
func (h *Handler) ListMembers(c *gin.Context, projectId openapi.ProjectId) {
	ms, err := h.d.Projects.ListMembers(c.Request.Context(), currentUser(c), projectId)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, mapSlice(ms, toMember))
}

// AddMember は POST /api/projects/{projectId}/members。
func (h *Handler) AddMember(c *gin.Context, projectId openapi.ProjectId) {
	var body openapi.AddMemberRequest
	if !bindJSON(c, &body) {
		return
	}
	m, err := h.d.Projects.AddMember(c.Request.Context(), currentUser(c), projectId, body.Email, string(body.Role))
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toMember(m))
}

// UpdateMemberRole は PATCH /api/projects/{projectId}/members/{userId}。
func (h *Handler) UpdateMemberRole(c *gin.Context, projectId openapi.ProjectId, userId openapi.UserId) {
	var body openapi.UpdateMemberRoleRequest
	if !bindJSON(c, &body) {
		return
	}
	m, err := h.d.Projects.UpdateMemberRole(c.Request.Context(), currentUser(c), projectId, userId, string(body.Role))
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toMember(m))
}

// RemoveMember は DELETE /api/projects/{projectId}/members/{userId}。
func (h *Handler) RemoveMember(c *gin.Context, projectId openapi.ProjectId, userId openapi.UserId) {
	if err := h.d.Projects.RemoveMember(c.Request.Context(), currentUser(c), projectId, userId); err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
