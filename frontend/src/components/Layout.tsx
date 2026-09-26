import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "react-router";

import { sessionStore, useSession } from "../auth/session";

export function Layout() {
  const session = useSession();
  const queryClient = useQueryClient();

  // トークンの失効 API は無いため、保存したセッションと前のユーザーのキャッシュを消す。
  const logout = () => {
    queryClient.clear();
    sessionStore.clear();
  };

  return (
    <>
      <header className="container">
        <nav>
          <ul>
            <li>
              <Link to="/">
                <strong>Task Management</strong>
              </Link>
            </li>
          </ul>
          <ul>
            <li>{session?.user.name}</li>
            <li>
              <button type="button" className="secondary" onClick={logout}>
                ログアウト
              </button>
            </li>
          </ul>
        </nav>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
