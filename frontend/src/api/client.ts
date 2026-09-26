import createClient, { type Middleware } from "openapi-fetch";

import { sessionStore } from "../auth/session";
import type { paths } from "./schema.gen";

// JWT の付与と 401 時の扱いは、この 1 箇所で行う。
const auth: Middleware = {
  onRequest({ request }) {
    const token = sessionStore.get()?.token;
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
  onResponse({ request, response }) {
    // 古いトークンで送ったリクエストの 401 で、再ログイン後の新しいセッションを消さない。
    const token = sessionStore.get()?.token;
    if (response.status === 401 && token && request.headers.get("Authorization") === `Bearer ${token}`) {
      sessionStore.clear();
    }
    return response;
  },
};

// 型は api/openapi.yaml から生成した schema.gen.ts のみを使う(手書きで重複定義しない)。
export const api = createClient<paths>({ baseUrl: "" });
api.use(auth);
