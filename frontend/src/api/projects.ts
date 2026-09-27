import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import { unwrap } from "./errors";
import type { components } from "./schema.gen";

export type Project = components["schemas"]["Project"];
export type Role = components["schemas"]["Role"];
type CreateProjectRequest = components["schemas"]["CreateProjectRequest"];

// 一覧と詳細でキーを分ける。作成時は一覧だけを取り直す(詳細は #3 で追加する)。
export const projectKeys = {
  all: ["projects"] as const,
  lists: () => [...projectKeys.all, "list"] as const,
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
