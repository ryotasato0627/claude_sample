import { Navigate, Outlet, useLocation } from "react-router";

import { useSession } from "./session";

// ログイン後の遷移先。未ログインでリダイレクトされた場合は、元の画面に戻す。
function redirectTo(state: unknown): string {
  if (typeof state === "object" && state !== null && "from" in state && typeof state.from === "string") {
    return state.from;
  }
  return "/";
}

export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

// ログイン済みならログイン・登録画面を表示しない。ログイン成功時の遷移もここで行う。
export function GuestOnly() {
  const session = useSession();
  const location = useLocation();
  if (session) return <Navigate to={redirectTo(location.state)} replace />;
  return <Outlet />;
}
