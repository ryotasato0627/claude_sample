import { type QueryClient, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionStore } from "../auth/session";
import { api } from "./client";
import { ApiError, unwrap } from "./errors";
import { useMounted } from "./mounted";
import { projectKeys, refreshDetailOnStaleError, type Role } from "./projects";
import type { components } from "./schema.gen";

export type Member = components["schemas"]["Member"];
type AddMemberRequest = components["schemas"]["AddMemberRequest"];

function isCurrentUser(userId: number): boolean {
  return sessionStore.get()?.user.id === userId;
}

function membersQuery(queryClient: QueryClient, projectId: number) {
  return {
    queryKey: projectKeys.members(projectId),
    queryFn: async () => {
      try {
        return await unwrap(api.GET("/api/projects/{projectId}/members", { params: { path: { projectId } } }));
      } catch (error) {
        // 削除された・メンバーから外された(404)場合は、詳細を取り直して画面全体を「見つからない」にする。
        // exact にして、メンバー一覧自体は取り直さない(取り直しが繰り返されないように)。
        if (error instanceof ApiError && error.status === 404) {
          void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId), exact: true });
        }
        throw error;
      }
    },
  };
}

// プロジェクトのメンバー一覧(全ロールが閲覧できる)。
export function useMembers(projectId: number) {
  const queryClient = useQueryClient();
  return useQuery(membersQuery(queryClient, projectId));
}

// 複数のプロジェクトのメンバー一覧をまとめて取得し、プロジェクト ID ごとに返す(Task 検索の担当者名に使う)。
// members は取得できたプロジェクトだけを含み、errors は取得に失敗したプロジェクトのエラーを含む。
// キャッシュは useMembers と共有する。
export function useMembersOf(projectIds: number[]): { members: Map<number, Member[]>; errors: Map<number, Error> } {
  const queryClient = useQueryClient();
  const unique = [...new Set(projectIds)];
  return useQueries({
    queries: unique.map((projectId) => membersQuery(queryClient, projectId)),
    combine: (results) => ({
      members: new Map(
        results.flatMap((result, i) => (result.data ? [[unique[i]!, result.data] as [number, Member[]]] : [])),
      ),
      errors: new Map(
        results.flatMap((result, i) => (result.error ? [[unique[i]!, result.error] as [number, Error]] : [])),
      ),
    }),
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
// 削除中に利用者が別の画面へ移っていたら呼ばない。
export function useRemoveMember(projectId: number, { onLeft }: { onLeft: () => void }) {
  const queryClient = useQueryClient();
  const mounted = useMounted();
  return useMutation({
    mutationFn: (userId: number) =>
      unwrap(api.DELETE("/api/projects/{projectId}/members/{userId}", { params: { path: { projectId, userId } } })),
    onSuccess: (_, userId) => {
      if (isCurrentUser(userId)) {
        if (mounted.current) onLeft();
        // 詳細は取り直さず(404 になる)、移動の後にキャッシュから消す。
        queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) });
        return queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      }
      // 外したメンバーが担当していた Task は Backend で担当が解除されるため、Task 一覧も取り直す。
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectKeys.tasks(projectId) }),
      ]);
    },
    onError: refreshDetailOnStaleError(queryClient, projectId),
  });
}
