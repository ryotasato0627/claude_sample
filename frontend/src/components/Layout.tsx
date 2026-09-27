import { Link, Outlet } from "react-router";

import { sessionStore, useSession } from "../auth/session";

export function Layout() {
  const session = useSession();

  // トークンの失効 API は無いため、保存したセッションを消す。キャッシュは clearCacheOnUserChange が消す。
  const logout = () => sessionStore.clear();

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
            <li>
              <Link to="/projects">プロジェクト</Link>
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
