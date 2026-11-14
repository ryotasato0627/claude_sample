import { keepPreviousData, type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import { ApiError, unwrap } from "./errors";
import { useMounted } from "./mounted";
import { projectKeys, refreshDetailOnStaleError } from "./projects";
import type { components } from "./schema.gen";

export type Task = components["schemas"]["Task"];
export type TaskStatus = components["schemas"]["TaskStatus"];
type CreateTaskRequest = components["schemas"]["CreateTaskRequest"];
export type UpdateTaskRequest = components["schemas"]["UpdateTaskRequest"];

// Task 詳細のキー。一覧(projectKeys.tasks)はプロジェクトの下にある。
// 詳細はプロジェクトの下に無いため、プロジェクトの削除やメンバーの削除では消えない・無効化されない。
// staleTime が既定の 0 で、開くたびに取り直す(404 なら見つからない表示にする)ことに依存している。
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

// ステータス変更(owner / member。遷移は自由)。
export function useUpdateTaskStatus(taskId: number, projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: TaskStatus) =>
      unwrap(api.PATCH("/api/tasks/{taskId}/status", { params: { path: { taskId } }, body: { status } })),
    onSuccess: applyUpdatedTask(queryClient),
    onError: refreshTaskOnStaleError(queryClient, taskId, projectId),
  });
}

// 担当者変更(owner / member)。解除は null を明示して送る(省略すると Backend は 422 を返す)。
export function useUpdateTaskAssignee(taskId: number, projectId: number) {
  const queryClient = useQueryClient();
  const refreshOnStale = refreshTaskOnStaleError(queryClient, taskId, projectId);
  return useMutation({
    mutationFn: (assigneeId: number | null) =>
      unwrap(api.PATCH("/api/tasks/{taskId}/assignee", { params: { path: { taskId } }, body: { assigneeId } })),
    onSuccess: applyUpdatedTask(queryClient),
    onError: (error) => {
      // 担当者がメンバーでない(選んだ後に外された)場合は 422 になる。選択肢を最新にする。
      if (error instanceof ApiError && error.status === 422) {
        return queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) });
      }
      return refreshOnStale(error);
    },
  });
}

// Task 削除(owner のみ)。onDeleted で詳細画面から移動する。削除中に利用者が別の画面へ移っていたら呼ばない。
export function useDeleteTask(taskId: number, projectId: number, { onDeleted }: { onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const mounted = useMounted();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/tasks/{taskId}", { params: { path: { taskId } } })),
    onSuccess: () => {
      if (mounted.current) onDeleted();
      // 削除した Task の詳細は取り直さず(404 になる)、移動を予約した後にキャッシュから消す(プロジェクトの削除と同じ)。
      queryClient.removeQueries({ queryKey: taskKeys.detail(taskId) });
      return queryClient.invalidateQueries({ queryKey: projectKeys.tasks(projectId) });
    },
    onError: refreshTaskOnStaleError(queryClient, taskId, projectId),
  });
}
