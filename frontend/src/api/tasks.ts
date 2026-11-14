import { keepPreviousData, type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import { ApiError, unwrap } from "./errors";
import { projectKeys, refreshDetailOnStaleError } from "./projects";
import type { components } from "./schema.gen";

export type Task = components["schemas"]["Task"];
export type TaskStatus = components["schemas"]["TaskStatus"];
type CreateTaskRequest = components["schemas"]["CreateTaskRequest"];
export type UpdateTaskRequest = components["schemas"]["UpdateTaskRequest"];

// Task 詳細のキー。一覧(projectKeys.tasks)はプロジェクトの下にある。
export const taskKeys = {
  all: ["tasks"] as const,
  detail: (taskId: number) => [...taskKeys.all, "detail", taskId] as const,
};

// 1 ページの件数(API の既定値と同じ)。
export const taskPageSize = 20;

export type TaskFilters = {
  status?: TaskStatus;
  assigneeId?: number;
  offset: number;
};

// プロジェクト内の Task 一覧(更新日時の降順。並び順は Backend が決める)。
// ページや絞り込みを変えている間は、前の結果を表示したままにする。
export function useProjectTasks(projectId: number, { status, assigneeId, offset }: TaskFilters) {
  const queryClient = useQueryClient();
  const query = { status, assigneeId, limit: taskPageSize, offset };
  return useQuery({
    queryKey: [...projectKeys.tasks(projectId), query],
    queryFn: async () => {
      try {
        return await unwrap(api.GET("/api/projects/{projectId}/tasks", { params: { path: { projectId }, query } }));
      } catch (error) {
        // 削除された・メンバーから外された(404)場合は、詳細を取り直して画面全体を「見つからない」にする
        // (メンバー一覧と同じ。exact にして、Task 一覧自体は取り直さない)。
        if (error instanceof ApiError && error.status === 404) {
          void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId), exact: true });
        }
        throw error;
      }
    },
    placeholderData: keepPreviousData,
  });
}

// Task 作成(owner / member)。作成後は Task 一覧(全ページ・全絞り込み)を取り直す。
// 権限が変わった(403)・プロジェクトが無くなった(404)場合は詳細を取り直す。
export function useCreateTask(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskRequest) =>
      unwrap(api.POST("/api/projects/{projectId}/tasks", { params: { path: { projectId } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.tasks(projectId) }),
    onError: refreshDetailOnStaleError(queryClient, projectId),
  });
}

// Task 詳細(全ロール)。メンバーでないプロジェクトの Task は Backend が 404 を返す。
export function useTask(taskId: number) {
  return useQuery({
    queryKey: taskKeys.detail(taskId),
    queryFn: () => unwrap(api.GET("/api/tasks/{taskId}", { params: { path: { taskId } } })),
  });
}

// 変更後は、詳細を応答で置き換え、プロジェクトの Task 一覧を取り直す。
function applyUpdatedTask(queryClient: QueryClient) {
  return (task: Task) => {
    queryClient.setQueryData(taskKeys.detail(task.id), task);
    return queryClient.invalidateQueries({ queryKey: projectKeys.tasks(task.projectId) });
  };
}

// 権限が変わった(403)・Task やプロジェクトが無くなった(404)場合は、Task とプロジェクトの詳細を取り直して
// 表示(ロール・存在)を最新にする。
function refreshTaskOnStaleError(queryClient: QueryClient, taskId: number, projectId: number) {
  const refreshProject = refreshDetailOnStaleError(queryClient, projectId);
  return (error: Error) => {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      return Promise.all([queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) }), refreshProject(error)]);
    }
  };
}

// タイトル・説明の更新(owner / member)。
export function useUpdateTask(taskId: number, projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTaskRequest) => unwrap(api.PATCH("/api/tasks/{taskId}", { params: { path: { taskId } }, body })),
    onSuccess: applyUpdatedTask(queryClient),
    onError: refreshTaskOnStaleError(queryClient, taskId, projectId),
  });
}
