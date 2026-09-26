import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_KEY = "session";
const user = { id: 1, email: "alice@example.com", name: "Alice", createdAt: "2026-01-01T00:00:00Z" };
const valid = { token: "jwt", expiresAt: "2999-01-01T00:00:00Z", user };

// 保存値はモジュールの読み込み時に読むため、テストごとに読み込み直す。
async function loadStore() {
  vi.resetModules();
  const { sessionStore } = await import("./session");
  return sessionStore;
}

describe("sessionStore", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("保存されたセッションを読み込む", async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(valid));
    expect((await loadStore()).get()).toEqual(valid);
  });

  it.each([
    ["形が不正な値", JSON.stringify({})],
    ["user が無い値", JSON.stringify({ token: "jwt", expiresAt: valid.expiresAt })],
    ["壊れた JSON", "{"],
    ["期限切れの値", JSON.stringify({ ...valid, expiresAt: "2000-01-01T00:00:00Z" })],
  ])("%sは破棄する", async (_, raw) => {
    localStorage.setItem(SESSION_KEY, raw);
    expect((await loadStore()).get()).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("有効期限が来るとセッションを消す", async () => {
    vi.useFakeTimers();
    const sessionStore = await loadStore();
    sessionStore.set({ ...valid, expiresAt: new Date(Date.now() + 1000).toISOString() });

    vi.advanceTimersByTime(999);
    expect(sessionStore.get()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(sessionStore.get()).toBeNull();
  });

  it.each([
    ["画面が表示されたとき", () => document.dispatchEvent(new Event("visibilitychange"))],
    ["フォーカスが戻ったとき", () => window.dispatchEvent(new Event("focus"))],
  ])("%sに期限切れなら、セッションを消す(スリープでタイマーが遅れた場合)", async (_, resume) => {
    vi.useFakeTimers();
    const sessionStore = await loadStore();
    sessionStore.set({ ...valid, expiresAt: new Date(Date.now() + 1000).toISOString() });

    resume();
    expect(sessionStore.get()).not.toBeNull();

    // タイマーを進めずに時刻だけ進める(スリープからの復帰を再現する)。
    vi.setSystemTime(Date.now() + 1000);
    resume();
    expect(sessionStore.get()).toBeNull();
  });

  it("他のタブでのログイン・ログアウトを反映する", async () => {
    const sessionStore = await loadStore();
    const listener = vi.fn();
    sessionStore.subscribe(listener);

    localStorage.setItem(SESSION_KEY, JSON.stringify(valid));
    window.dispatchEvent(new StorageEvent("storage", { key: SESSION_KEY }));
    expect(sessionStore.get()).toEqual(valid);

    localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: SESSION_KEY }));
    expect(sessionStore.get()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
