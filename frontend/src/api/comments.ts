import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import { ApiError, unwrap } from "./errors";
import type { components } from "./schema.gen";
import { refreshTaskOnStaleError, taskKeys } from "./tasks";

export type Comment = components["schemas"]["Comment"];

// Task のコメント一覧(全ロール。投稿の古い順。並び順は Backend が決める)。
export function useComments(taskId: number) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: taskKeys.comments(taskId),
    queryFn: async () => {
      try {
        return await unwrap(api.GET("/api/tasks/{taskId}/comments", { params: { path: { taskId } } }));
      } catch (error) {
        // Task が削除された・メンバーから外された(404)場合は、Task を取り直して画面全体を「見つからない」にする
        // (exact にして、コメント一覧自体は取り直さない)。
        if (error instanceof ApiError && error.status === 404) {
          void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId), exact: true });
        }
        throw error;
      }
    },
  });
}

// 以下の変更系は、権限が変わった(403)・Task やコメントが無くなった(404)場合に Task とプロジェクトを取り直す。
// コメント一覧のキーは Task 詳細の下にあるため、一緒に取り直される。

// コメント投稿(owner / member)。
export function useCreateComment(taskId: number, projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      unwrap(api.POST("/api/tasks/{taskId}/comments", { params: { path: { taskId } }, body: { body } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.comments(taskId) }),
    onError: refreshTaskOnStaleError(queryClient, taskId, projectId),
  });
}
