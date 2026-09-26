import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { api } from "./api/client";
import { sessionStore } from "./auth/session";

vi.mock("./api/client", () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

const user = { id: 1, email: "alice@example.com", name: "Alice", createdAt: "2026-01-01T00:00:00Z" };

function renderApp(path = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function submitLogin() {
  fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: "alice@example.com" } });
  fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: "password123" } });
  fireEvent.click(screen.getByRole("button", { name: "ログイン" }));
}

describe("認証", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStore.clear();
  });

  it("未ログインならログイン画面へ移動する", async () => {
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
  });

  it("ログインに成功すると、ホームを表示してセッションを保存する", async () => {
    vi.mocked(api.POST).mockResolvedValue({
      data: { token: "jwt", expiresAt: "2026-01-02T00:00:00Z", user },
      response: { ok: true, status: 200 },
    } as never);
    renderApp("/");
    submitLogin();

    expect(await screen.findByRole("heading", { name: "ようこそ、Alice さん" })).toBeInTheDocument();
    expect(api.POST).toHaveBeenCalledWith("/api/auth/login", {
      body: { email: "alice@example.com", password: "password123" },
    });
    expect(sessionStore.get()).toEqual({ token: "jwt", user });
  });

  it("認証に失敗するとエラーを表示する", async () => {
    vi.mocked(api.POST).mockResolvedValue({
      error: { code: "unauthorized", message: "authentication required" },
      response: { ok: false, status: 401 },
    } as never);
    renderApp("/login");
    submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent("メールアドレスまたはパスワードが正しくありません");
    expect(sessionStore.get()).toBeNull();
  });

  it("サーバーに接続できない場合はエラーを表示する", async () => {
    vi.mocked(api.POST).mockRejectedValue(new TypeError("Failed to fetch"));
    renderApp("/login");
    submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
  });

  it("ログイン済みならログイン画面を表示しない", async () => {
    sessionStore.set({ token: "jwt", user });
    renderApp("/login");
    expect(await screen.findByRole("heading", { name: "ようこそ、Alice さん" })).toBeInTheDocument();
  });

  it("ログアウトするとセッションを消してログイン画面へ移動する", async () => {
    sessionStore.set({ token: "jwt", user });
    renderApp("/");
    fireEvent.click(await screen.findByRole("button", { name: "ログアウト" }));

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
    expect(sessionStore.get()).toBeNull();
  });
});
