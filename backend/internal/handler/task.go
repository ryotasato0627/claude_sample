package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"

	"taskapp/backend/internal/domain"
	"taskapp/backend/internal/handler/openapi"
)

// ListProjectTasks は GET /api/projects/{projectId}/tasks。
func (h *Handler) ListProjectTasks(c *gin.Context, projectId openapi.ProjectId, params openapi.ListProjectTasksParams) {
	f := taskFilter(params.Q, params.Status, params.AssigneeId, params.Limit, params.Offset)
	tasks, total, err := h.d.Tasks.ListByProject(c.Request.Context(), currentUser(c), projectId, f)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toTaskList(tasks, total, f))
}

// SearchTasks は GET /api/tasks/search。
func (h *Handler) SearchTasks(c *gin.Context, params openapi.SearchTasksParams) {
	f := taskFilter(params.Q, params.Status, params.AssigneeId, params.Limit, params.Offset)
	f.ProjectID = params.ProjectId
	tasks, total, err := h.d.Tasks.Search(c.Request.Context(), currentUser(c), f)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toTaskList(tasks, total, f))
}

// CreateTask は POST /api/projects/{projectId}/tasks。
func (h *Handler) CreateTask(c *gin.Context, projectId openapi.ProjectId) {
	var body openapi.CreateTaskRequest
	if !bindJSON(c, &body) {
		return
	}
	t, err := h.d.Tasks.Create(c.Request.Context(), currentUser(c), projectId, body.Title, body.Description)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toTask(t))
}

// GetTask は GET /api/tasks/{taskId}。
func (h *Handler) GetTask(c *gin.Context, taskId openapi.TaskId) {
	t, err := h.d.Tasks.Get(c.Request.Context(), currentUser(c), taskId)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toTask(t))
}

// UpdateTask は PATCH /api/tasks/{taskId}。
func (h *Handler) UpdateTask(c *gin.Context, taskId openapi.TaskId) {
	var body openapi.UpdateTaskRequest
	if !bindJSON(c, &body) {
		return
	}
	t, err := h.d.Tasks.Update(c.Request.Context(), currentUser(c), taskId, body.Title, body.Description)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toTask(t))
}

// UpdateTaskStatus は PATCH /api/tasks/{taskId}/status。
func (h *Handler) UpdateTaskStatus(c *gin.Context, taskId openapi.TaskId) {
	var body openapi.UpdateTaskStatusRequest
	if !bindJSON(c, &body) {
		return
	}
	t, err := h.d.Tasks.UpdateStatus(c.Request.Context(), currentUser(c), taskId, string(body.Status))
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toTask(t))
}

// UpdateTaskAssignee は PATCH /api/tasks/{taskId}/assignee。assigneeId が null なら担当を解除する。
// assigneeId の省略は null と区別して 422 にする(クライアントのバグで、黙って担当が外れないように)。
func (h *Handler) UpdateTaskAssignee(c *gin.Context, taskId openapi.TaskId) {
	var body map[string]json.RawMessage
	if !bindJSON(c, &body) {
		return
	}
	raw, ok := body["assigneeId"]
	if !ok {
		writeError(c, domain.Invalid("assigneeId is required (use null to unassign)"))
		return
	}
	var assigneeID *int64 // null なら nil のまま
	if err := json.Unmarshal(raw, &assigneeID); err != nil {
		badRequest(c, "assigneeId must be an integer or null")
		return
	}
	t, err := h.d.Tasks.UpdateAssignee(c.Request.Context(), currentUser(c), taskId, assigneeID)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toTask(t))
}

// DeleteTask は DELETE /api/tasks/{taskId}。
func (h *Handler) DeleteTask(c *gin.Context, taskId openapi.TaskId) {
	if err := h.d.Tasks.Delete(c.Request.Context(), currentUser(c), taskId); err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
