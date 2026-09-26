import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearCacheOnUserChange } from "./cache";
import { sessionStore } from "./session";

const expiresAt = "2999-01-01T00:00:00Z";
const alice = { id: 1, email: "alice@example.com", name: "Alice", createdAt: "2026-01-01T00:00:00Z" };
const bob = { id: 2, email: "bob@example.com", name: "Bob", createdAt: "2026-01-01T00:00:00Z" };

describe("clearCacheOnUserChange", () => {
  let queryClient: QueryClient;
  let unsubscribe: () => void;

  beforeEach(() => {
    localStorage.clear();
    sessionStore.set({ token: "alice", expiresAt, user: alice });
    queryClient = new QueryClient();
    unsubscribe = clearCacheOnUserChange(queryClient);
    queryClient.setQueryData(["projects"], ["Alice のデータ"]);
  });
  afterEach(() => {
    unsubscribe();
    sessionStore.clear();
  });

  it("他のタブで別のユーザーがログインすると、キャッシュを消す", () => {
    localStorage.setItem("session", JSON.stringify({ token: "bob", expiresAt, user: bob }));
    window.dispatchEvent(new StorageEvent("storage", { key: "session" }));

    expect(sessionStore.get()?.user.name).toBe("Bob");
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
  });

  it("ログアウトすると、キャッシュを消す", () => {
    sessionStore.clear();
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
  });

  it("同じユーザーのままなら、キャッシュを消さない", () => {
    sessionStore.set({ token: "alice-new", expiresAt, user: alice });
    expect(queryClient.getQueryData(["projects"])).toEqual(["Alice のデータ"]);
  });
});
