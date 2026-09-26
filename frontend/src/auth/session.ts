import { useSyncExternalStore } from "react";

import type { components } from "../api/schema.gen";

export type User = components["schemas"]["User"];

// 現在のユーザーを返す API は無いため、ログイン応答の user をトークンと一緒に保存する。
export type Session = { token: string; user: User };

const SESSION_KEY = "session";
const listeners = new Set<() => void>();
let current: Session | null = load();

function load(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

export const sessionStore = {
  get: () => current,
  set(session: Session) {
    current = session;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    notify();
  },
  clear() {
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
