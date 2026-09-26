import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionStore } from "../auth/session";
import { api } from "./client";

const user = { id: 1, email: "alice@example.com", name: "Alice", createdAt: "2026-01-01T00:00:00Z" };

function respond(status: number, body: unknown) {
  return vi.fn<(request: Request) => Promise<Response>>(async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

// baseUrl は、テスト環境の Request が相対 URL を受け付けないため指定する。
const options = { baseUrl: "http://localhost" };

describe("api クライアント", () => {
  beforeEach(() => sessionStore.clear());

  it("ログイン済みなら Authorization ヘッダにトークンを付ける", async () => {
    sessionStore.set({ token: "jwt", user });
    const fetch = respond(200, []);
    await api.GET("/api/projects", { ...options, fetch });

    expect(fetch.mock.calls[0]?.[0].headers.get("Authorization")).toBe("Bearer jwt");
  });

  it("未ログインなら Authorization ヘッダを付けない", async () => {
    const fetch = respond(200, { status: "ok" });
    await api.GET("/api/health", { ...options, fetch });

    expect(fetch.mock.calls[0]?.[0].headers.has("Authorization")).toBe(false);
  });

  it("401 を受け取るとセッションを消す", async () => {
    sessionStore.set({ token: "expired", user });
    await api.GET("/api/projects", { ...options, fetch: respond(401, { code: "unauthorized", message: "authentication required" }) });

    expect(sessionStore.get()).toBeNull();
  });

  it("401 以外のエラーではセッションを消さない", async () => {
    sessionStore.set({ token: "jwt", user });
    await api.GET("/api/projects/{projectId}", {
      ...options,
      params: { path: { projectId: 1 } },
      fetch: respond(404, { code: "not_found", message: "resource not found" }),
    });

    expect(sessionStore.get()).not.toBeNull();
  });
});
