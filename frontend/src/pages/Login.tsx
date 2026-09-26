import type { FormEvent } from "react";
import { Link, useLocation } from "react-router";

import { useLogin } from "../api/auth";
import { errorMessage } from "../api/errors";

export function Login() {
  const location = useLocation();
  const registered = typeof location.state === "object" && location.state !== null && "registered" in location.state;
  const login = useLogin();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    login.mutate({ email: String(form.get("email")), password: String(form.get("password")) });
  };

  return (
    <main className="container">
      <h1>ログイン</h1>
      {registered && <p role="status">登録しました。ログインしてください</p>}
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
      <p>
        アカウントをお持ちでない方は <Link to="/register">ユーザー登録</Link>
      </p>
    </main>
  );
}
