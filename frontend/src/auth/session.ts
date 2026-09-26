import { useSyncExternalStore } from "react";

import type { components } from "../api/schema.gen";

export type User = components["schemas"]["User"];

// 現在のユーザーを返す API は無いため、ログイン応答の user をトークンと一緒に保存する。
export type Session = { token: string; expiresAt: string; user: User };

const SESSION_KEY = "session";
// setTimeout に渡せる最大の待ち時間(約 24.8 日)。超えるとすぐに実行されてしまう。
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const listeners = new Set<() => void>();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

// localStorage は外部入力として扱い、形を確認してから使う。
function isSession(value: unknown): value is Session {
  return (
    typeof value === "object" &&
    value !== null &&
    "token" in value &&
    typeof value.token === "string" &&
    "expiresAt" in value &&
    typeof value.expiresAt === "string" &&
    "user" in value &&
    typeof value.user === "object" &&
    value.user !== null &&
    "id" in value.user &&
    typeof value.user.id === "number" &&
    "email" in value.user &&
    typeof value.user.email === "string" &&
    "name" in value.user &&
    typeof value.user.name === "string" &&
    "createdAt" in value.user &&
    typeof value.user.createdAt === "string"
  );
}

// サーバーの expiresAt とクライアントの時計を比べる。時計のずれはスコープ外(requirements.md §11)。
function isExpired(session: Session) {
  return !(Date.parse(session.expiresAt) > Date.now());
}

// 不正な値・期限切れの値は破棄する。
function load(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (isSession(value) && !isExpired(value)) return value;
  } catch {
    // 壊れた JSON も破棄する。
  }
  localStorage.removeItem(SESSION_KEY);
  return null;
}

let current: Session | null = load();
scheduleExpiry();

// 有効期限が来たらセッションを消す(期限切れのトークンで画面を表示し続けない)。
// トークンの有効期限は 24 時間のため、最大の待ち時間を超える場合は設定しない。
function scheduleExpiry() {
  clearTimeout(expiryTimer);
  if (!current) return;
  const delay = Date.parse(current.expiresAt) - Date.now();
  if (delay <= MAX_TIMEOUT_MS) expiryTimer = setTimeout(() => sessionStore.clear(), delay);
}

function notify() {
  listeners.forEach((listener) => listener());
}

// スリープ中はタイマーが進まないことがあるため、画面に戻ったときにも期限を確認する。
function clearIfExpired() {
  if (current && isExpired(current)) sessionStore.clear();
}
window.addEventListener("focus", clearIfExpired);
document.addEventListener("visibilitychange", clearIfExpired);

// 他のタブでのログイン・ログアウトを反映する。
window.addEventListener("storage", (event) => {
  if (event.key !== SESSION_KEY && event.key !== null) return;
  current = load();
  scheduleExpiry();
  notify();
});

export const sessionStore = {
  get: () => current,
  set(session: Session) {
    current = session;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    scheduleExpiry();
    notify();
  },
  clear() {
    clearTimeout(expiryTimer);
    if (!current) return;
    current = null;
    localStorage.removeItem(SESSION_KEY);
    notify();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useSession() {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
}
