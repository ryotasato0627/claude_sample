import type { QueryClient } from "@tanstack/react-query";

import { sessionStore } from "./session";

// セッションのユーザーが変わったら(ログイン・ログアウト・他のタブでの切り替え)、前のユーザーのキャッシュを消す。
// React の再描画より先に消すため、React の外でセッションの変更を購読する。
export function clearCacheOnUserChange(queryClient: QueryClient) {
  let userId = sessionStore.get()?.user.id;
  return sessionStore.subscribe(() => {
    const next = sessionStore.get()?.user.id;
    if (next === userId) return;
    userId = next;
    queryClient.clear();
  });
}
