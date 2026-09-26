import createClient, { type Middleware } from "openapi-fetch";

import type { paths } from "./schema.gen";

const TOKEN_KEY = "token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// JWT の付与と 401 時の扱いは、この 1 箇所で行う。
const auth: Middleware = {
  onRequest({ request }) {
    const token = tokenStore.get();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
  onResponse({ response }) {
    if (response.status === 401) tokenStore.clear();
    return response;
  },
};

// 型は api/openapi.yaml から生成した schema.gen.ts のみを使う(手書きで重複定義しない)。
export const api = createClient<paths>({ baseUrl: "" });
api.use(auth);
