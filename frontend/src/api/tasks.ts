import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "./client";
import { unwrap } from "./errors";
import { projectKeys } from "./projects";
import type { components } from "./schema.gen";

export type Task = components["schemas"]["Task"];
export type TaskStatus = components["schemas"]["TaskStatus"];

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
  return useQuery({
    queryKey: [...projectKeys.tasks(projectId), { status, assigneeId, offset }],
    queryFn: () =>
      unwrap(
        api.GET("/api/projects/{projectId}/tasks", {
          params: { path: { projectId }, query: { status, assigneeId, limit: taskPageSize, offset } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}
