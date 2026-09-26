import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { useRegister } from "../api/auth";
import { errorMessage } from "../api/errors";

export function Register() {
  const navigate = useNavigate();
  const register = useRegister();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    register.mutate(
      {
        name: String(form.get("name")),
        email: String(form.get("email")),
        password: String(form.get("password")),
      },
      { onSuccess: () => navigate("/login", { state: { registered: true } }) },
    );
  };

  return (
    <main className="container">
      <h1>ユーザー登録</h1>
      <form onSubmit={submit}>
        <label>
          表示名
          <input name="name" autoComplete="name" required maxLength={100} />
        </label>
        <label>
          メールアドレス
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          パスワード
          <input name="password" type="password" autoComplete="new-password" required minLength={8} />
          <small>8文字以上</small>
        </label>
        {register.isError && (
          <p role="alert">{errorMessage(register.error, { 409: "このメールアドレスは既に登録されています" })}</p>
        )}
        <button type="submit" disabled={register.isPending} aria-busy={register.isPending}>
          登録する
        </button>
      </form>
      <p>
        登録済みの方は <Link to="/login">ログイン</Link>
      </p>
    </main>
  );
}
