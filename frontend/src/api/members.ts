import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionStore } from "../auth/session";
import { api } from "./client";
import { projectKeys, refreshDetailOnStaleError, type Role } from "./projects";
import { unwrap } from "./errors";
import type { components } from "./schema.gen";

export type Member = components["schemas"]["Member"];
type AddMemberRequest = components["schemas"]["AddMemberRequest"];

function isCurrentUser(userId: number): boolean {
  return sessionStore.get()?.user.id === userId;
}

// プロジェクトのメンバー一覧(全ロールが閲覧できる)。
export function useMembers(projectId: number) {
  return useQuery({
    queryKey: projectKeys.members(projectId),
    queryFn: () => unwrap(api.GET("/api/projects/{projectId}/members", { params: { path: { projectId } } })),
  });
}

// 以下の変更系は、権限が変わった(403)・プロジェクトやメンバーが無くなった(404)場合に詳細を取り直す。
// メンバー一覧のキーは詳細の下にあるため、一緒に取り直される。

// メンバー追加(登録済みユーザーをメールアドレスで指定)。
export function useAddMember(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AddMemberRequest) =>
      unwrap(api.POST("/api/projects/{projectId}/members", { params: { path: { projectId } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) }),
    onError: refreshDetailOnStaleError(queryClient, projectId),
  });
}

export function useUpdateMemberRole(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: Role }) =>
      unwrap(
        api.PATCH("/api/projects/{projectId}/members/{userId}", {
          params: { path: { projectId, userId } },
          body: { role },
        }),
      ),
    onSuccess: (member) => {
      // 自分のロールを変えた場合は、詳細(自分のロール)と一覧(ロールを表示している)も取り直す。
      if (isCurrentUser(member.userId)) {
        void queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
        return queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      }
      return queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) });
    },
    onError: refreshDetailOnStaleError(queryClient, projectId),
  });
}

// onLeft: 自分を外したときに呼ぶ(プロジェクトを表示できなくなるため、詳細画面から移動する)。
export function useRemoveMember(projectId: number, { onLeft }: { onLeft: () => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      unwrap(api.DELETE("/api/projects/{projectId}/members/{userId}", { params: { path: { projectId, userId } } })),
    onSuccess: (_, userId) => {
      if (isCurrentUser(userId)) {
        onLeft();
        // 詳細は取り直さず(404 になる)、移動の後にキャッシュから消す。
        queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) });
        return queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      }
      return queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) });
    },
    onError: refreshDetailOnStaleError(queryClient, projectId),
  });
}
