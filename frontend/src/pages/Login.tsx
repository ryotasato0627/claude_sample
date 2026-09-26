import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";

import { api } from "../api/client";
import { errorMessage, unwrap } from "../api/errors";
import type { components } from "../api/schema.gen";
import { sessionStore } from "../auth/session";

type LoginRequest = components["schemas"]["LoginRequest"];

export function Login() {
  const queryClient = useQueryClient();
  const login = useMutation({
    mutationFn: (body: LoginRequest) => unwrap(api.POST("/api/auth/login", { body })),
    // 画面の遷移は GuestOnly が行う。
    onSuccess: ({ token, user }) => {
      queryClient.clear();
      sessionStore.set({ token, user });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    login.mutate({ email: String(form.get("email")), password: String(form.get("password")) });
  };

  return (
    <main className="container">
      <h1>ログイン</h1>
      <form onSubmit={submit}>
        <label>
          メールアドレス
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          パスワード
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {login.isError && (
          <p role="alert">{errorMessage(login.error, { 401: "メールアドレスまたはパスワードが正しくありません" })}</p>
        )}
        <button type="submit" disabled={login.isPending} aria-busy={login.isPending}>
          ログイン
        </button>
      </form>
    </main>
  );
}
