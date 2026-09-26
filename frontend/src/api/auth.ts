import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sessionStore } from "../auth/session";
import { api } from "./client";
import { unwrap } from "./errors";
import type { components } from "./schema.gen";

type LoginRequest = components["schemas"]["LoginRequest"];
type RegisterRequest = components["schemas"]["RegisterRequest"];

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => unwrap(api.POST("/api/auth/login", { body })),
    // 前のユーザーのキャッシュを消してからセッションを保存する。画面の遷移は GuestOnly が行う。
    onSuccess: ({ token, expiresAt, user }) => {
      queryClient.clear();
      sessionStore.set({ token, expiresAt, user });
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterRequest) => unwrap(api.POST("/api/auth/register", { body })),
  });
}
