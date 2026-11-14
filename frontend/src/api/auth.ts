import { useMutation } from "@tanstack/react-query";

import { sessionStore } from "../auth/session";
import { api } from "./client";
import { unwrap } from "./errors";
import type { components } from "./schema.gen";

type LoginRequest = components["schemas"]["LoginRequest"];
type RegisterRequest = components["schemas"]["RegisterRequest"];

export function useLogin() {
  return useMutation({
    mutationFn: (body: LoginRequest) => unwrap(api.POST("/api/auth/login", { body })),
    // 前のユーザーのキャッシュは clearCacheOnUserChange が消す。画面の遷移は GuestOnly が行う。
    onSuccess: ({ token, expiresAt, user }) => sessionStore.set({ token, expiresAt, user }),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterRequest) => unwrap(api.POST("/api/auth/register", { body })),
  });
}
