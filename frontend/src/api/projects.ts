import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import { ApiError, unwrap } from "./errors";
import type { components } from "./schema.gen";

export type Project = components["schemas"]["Project"];
export type Role = components["schemas"]["Role"];
type CreateProjectRequest = components["schemas"]["CreateProjectRequest"];
export type UpdateProjectRequest = components["schemas"]["UpdateProjectRequest"];

// 一覧と詳細でキーを分ける。作成時は一覧だけを取り直す。
export const projectKeys = {
  all: ["projects"] as const,
  lists: () => [...projectKeys.all, "list"] as const,
  detail: (projectId: number) => [...projectKeys.all, "detail", projectId] as const,
};

// 自分が所属するプロジェクトの一覧(所属の絞り込みは Backend が行う)。
export function useProjects() {
  return useQuery({
    queryKey: projectKeys.lists(),
    queryFn: () => unwrap(api.GET("/api/projects")),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProjectRequest) => unwrap(api.POST("/api/projects", { body })),
    // 一覧は Backend から取り直す(並び順・ロールをサーバーの結果に揃える)。
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
  });
}

// プロジェクト詳細(自分のロールを含む)。メンバーでなければ Backend は 404 を返す。
export function useProject(projectId: number) {
  return useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => unwrap(api.GET("/api/projects/{projectId}", { params: { path: { projectId } } })),
  });
}

// 権限が変わった(403)・削除された(404)場合は、詳細を取り直して表示(ロール・存在)を最新にする。
function refreshDetailOnStaleError(queryClient: QueryClient, projectId: number) {
  return (error: Error) => {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      return queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    }
  };
}

export function useUpdateProject(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProjectRequest) =>
      unwrap(api.PATCH("/api/projects/{projectId}", { params: { path: { projectId } }, body })),
    // 詳細は応答で置き換え、一覧(名前・説明を表示している)は取り直す。
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(projectId), project);
      return queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
    onError: refreshDetailOnStaleError(queryClient, projectId),
  });
}

export function useDeleteProject(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/projects/{projectId}", { params: { path: { projectId } } })),
    // 削除したプロジェクトの詳細は取り直さず(404 になる)、キャッシュから消す。
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) });
      return queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
    onError: refreshDetailOnStaleError(queryClient, projectId),
  });
}
