import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { api } from "./api/client";
import { sessionStore } from "./auth/session";

vi.mock("./api/client", () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

const user = { id: 1, email: "alice@example.com", name: "Alice", createdAt: "2026-01-01T00:00:00Z" };
const expiresAt = "2999-01-01T00:00:00Z";

function CurrentLocation() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderApp(path = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <CurrentLocation />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient };
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
      data: { token: "jwt", expiresAt, user },
      response: { ok: true, status: 200 },
    } as never);
    renderApp("/");
    submitLogin();

    expect(await screen.findByRole("heading", { name: "ようこそ、Alice さん" })).toBeInTheDocument();
    expect(api.POST).toHaveBeenCalledWith("/api/auth/login", {
      body: { email: "alice@example.com", password: "password123" },
    });
    expect(sessionStore.get()).toEqual({ token: "jwt", expiresAt, user });
  });

  it("ログインすると、リダイレクトされる前の画面に戻る", async () => {
    vi.mocked(api.POST).mockResolvedValue({
      data: { token: "jwt", expiresAt, user },
      response: { ok: true, status: 200 },
    } as never);
    renderApp("/?tab=mine");
    expect(await screen.findByTestId("location")).toHaveTextContent(/^\/login$/);
    submitLogin();

    expect(await screen.findByRole("heading", { name: "ようこそ、Alice さん" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/\?tab=mine$/);
  });

  it("ログインすると、前のユーザーのキャッシュを消す", async () => {
    vi.mocked(api.POST).mockResolvedValue({
      data: { token: "jwt", expiresAt, user },
      response: { ok: true, status: 200 },
    } as never);
    const { queryClient } = renderApp("/login");
    queryClient.setQueryData(["projects"], ["前のユーザーのデータ"]);
    submitLogin();

    expect(await screen.findByRole("heading", { name: "ようこそ、Alice さん" })).toBeInTheDocument();
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
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
    sessionStore.set({ token: "jwt", expiresAt, user });
    renderApp("/login");
    expect(await screen.findByRole("heading", { name: "ようこそ、Alice さん" })).toBeInTheDocument();
  });

  it("ログイン画面から登録画面へ移動できる", async () => {
    renderApp("/login");
    fireEvent.click(screen.getByRole("link", { name: "ユーザー登録" }));
    expect(await screen.findByRole("heading", { name: "ユーザー登録" })).toBeInTheDocument();
  });

  it("ログアウトするとセッションを消してログイン画面へ移動する", async () => {
    sessionStore.set({ token: "jwt", expiresAt, user });
    renderApp("/");
    fireEvent.click(await screen.findByRole("button", { name: "ログアウト" }));

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
    expect(sessionStore.get()).toBeNull();
  });

  it("ログアウトすると、キャッシュを消す", async () => {
    sessionStore.set({ token: "jwt", expiresAt, user });
    const { queryClient } = renderApp("/");
    queryClient.setQueryData(["projects"], ["Alice のデータ"]);
    fireEvent.click(await screen.findByRole("button", { name: "ログアウト" }));

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
  });
});

describe("ユーザー登録", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStore.clear();
  });

  function submitRegister() {
    fireEvent.change(screen.getByLabelText("表示名"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: "alice@example.com" } });
    fireEvent.change(screen.getByLabelText(/パスワード/), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "登録する" }));
  }

  it("登録に成功すると、ログイン画面へ移動して完了を表示する", async () => {
    vi.mocked(api.POST).mockResolvedValue({ data: user, response: { ok: true, status: 201 } } as never);
    renderApp("/register");
    submitRegister();

    expect(await screen.findByRole("status")).toHaveTextContent("登録しました。ログインしてください");
    expect(screen.getByRole("heading", { name: "ログイン" })).toBeInTheDocument();
    expect(api.POST).toHaveBeenCalledWith("/api/auth/register", {
      body: { name: "Alice", email: "alice@example.com", password: "password123" },
    });
    expect(sessionStore.get()).toBeNull();
  });

  it("メールアドレスが登録済みならエラーを表示する", async () => {
    vi.mocked(api.POST).mockResolvedValue({
      error: { code: "conflict", message: "the resource already exists or conflicts with its current state" },
      response: { ok: false, status: 409 },
    } as never);
    renderApp("/register");
    submitRegister();

    expect(await screen.findByRole("alert")).toHaveTextContent("このメールアドレスは既に登録されています");
  });

  it("入力値の検証エラーは、Backend の詳細を添えて表示する", async () => {
    vi.mocked(api.POST).mockResolvedValue({
      error: { code: "validation_error", message: "email is invalid" },
      response: { ok: false, status: 422 },
    } as never);
    renderApp("/register");
    submitRegister();

    expect(await screen.findByRole("alert")).toHaveTextContent("入力内容を確認してください(email is invalid)");
  });
});
