import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { api } from "../api/client";
import type { Project } from "../api/projects";
import { sessionStore } from "../auth/session";

vi.mock("../api/client", () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

const user = { id: 1, email: "alice@example.com", name: "Alice", createdAt: "2026-01-01T00:00:00Z" };

function project(overrides: Partial<Project>): Project {
  return { id: 1, name: "P", description: "", role: "owner", createdAt: "2026-01-01T00:00:00Z", ...overrides };
}

function ok<T>(data: T, status = 200) {
  return { data, response: { ok: true, status } } as never;
}

function fail(status: number, message = "error") {
  return { error: { code: "error", message }, response: { ok: false, status } } as never;
}

function renderApp(path = "/projects") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function submitCreate(name: string, description = "") {
  fireEvent.change(screen.getByLabelText("名前"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("説明"), { target: { value: description } });
  fireEvent.click(screen.getByRole("button", { name: "作成する" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStore.set({ token: "jwt", expiresAt: "2999-01-01T00:00:00Z", user });
});

describe("プロジェクト一覧", () => {
  it("所属するプロジェクトを、名前・説明・自分のロールとともに表示する", async () => {
    vi.mocked(api.GET).mockResolvedValue(
      ok([
        project({ id: 1, name: "Alpha", description: "最初のプロジェクト", role: "owner" }),
        project({ id: 2, name: "Beta", role: "member" }),
        project({ id: 3, name: "Gamma", role: "viewer" }),
      ]),
    );
    renderApp();

    const rows = await screen.findAllByRole("row");
    expect(rows.slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["Alpha", "最初のプロジェクト", "オーナー"],
      ["Beta", "", "メンバー"],
      ["Gamma", "", "閲覧者"],
    ]);
    expect(api.GET).toHaveBeenCalledWith("/api/projects");
  });

  it("所属するプロジェクトが無ければ、その旨を表示する", async () => {
    vi.mocked(api.GET).mockResolvedValue(ok([]));
    renderApp();

    expect(await screen.findByText("所属しているプロジェクトはまだありません")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("読み込み中は、その旨を表示する", async () => {
    vi.mocked(api.GET).mockReturnValue(new Promise(() => {}) as never);
    renderApp();

    expect(await screen.findByText("読み込み中...")).toHaveAttribute("aria-busy", "true");
  });

  it("一覧を取得できなければ、エラーを表示する", async () => {
    vi.mocked(api.GET).mockRejectedValue(new TypeError("Failed to fetch"));
    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
  });

  it("一覧の取得で API がエラーを返したら、エラーを表示する", async () => {
    vi.mocked(api.GET).mockResolvedValue(fail(500));
    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("エラーが発生しました");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("説明の改行を、そのまま表示する", async () => {
    vi.mocked(api.GET).mockResolvedValue(ok([project({ name: "Alpha", description: "1行目\n2行目" })]));
    renderApp();

    expect(await screen.findByRole("cell", { name: /1行目/ })).toHaveStyle({ whiteSpace: "pre-line" });
  });

  it("ナビゲーションから一覧へ移動できる", async () => {
    vi.mocked(api.GET).mockResolvedValue(ok([project({ name: "Alpha" })]));
    renderApp("/");
    fireEvent.click(await screen.findByRole("link", { name: "プロジェクト" }));

    expect(await screen.findByRole("heading", { name: "プロジェクト", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "Alpha" })).toBeInTheDocument();
    // 現在の画面を支援技術に伝える
    expect(screen.getByRole("link", { name: "プロジェクト" })).toHaveAttribute("aria-current", "page");
  });

  it("未ログインならログイン画面へ移動する", async () => {
    sessionStore.clear();
    renderApp();

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
    expect(api.GET).not.toHaveBeenCalled();
  });
});

describe("プロジェクト作成", () => {
  it("作成すると、一覧を取り直して新しいプロジェクトを表示し、フォームを空にする", async () => {
    vi.mocked(api.GET)
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValue(ok([project({ id: 9, name: "New", description: "説明", role: "owner" })]));
    vi.mocked(api.POST).mockResolvedValue(ok(project({ id: 9, name: "New", description: "説明" }), 201));
    renderApp();
    await screen.findByText("所属しているプロジェクトはまだありません");

    submitCreate("New", "説明");

    expect(await screen.findByRole("cell", { name: "New" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "オーナー" })).toBeInTheDocument(); // 作成者は owner
    expect(screen.getByRole("status")).toHaveTextContent("プロジェクトを作成しました");
    expect(api.POST).toHaveBeenCalledWith("/api/projects", { body: { name: "New", description: "説明" } });
    expect(api.GET).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("名前")).toHaveValue("");
    expect(screen.getByLabelText("説明")).toHaveValue("");
  });

  it("入力値の検証エラーは、詳細を添えて表示し、入力を残す", async () => {
    vi.mocked(api.GET).mockResolvedValue(ok([]));
    vi.mocked(api.POST).mockResolvedValue(fail(422, "name is required"));
    renderApp();
    await screen.findByText("所属しているプロジェクトはまだありません");

    submitCreate(" ");

    expect(await screen.findByRole("alert")).toHaveTextContent("入力内容を確認してください(name is required)");
    expect(screen.getByLabelText("名前")).toHaveValue(" ");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("作成時にサーバーに接続できなければ、エラーを表示する", async () => {
    vi.mocked(api.GET).mockResolvedValue(ok([]));
    vi.mocked(api.POST).mockRejectedValue(new TypeError("Failed to fetch"));
    renderApp();
    await screen.findByText("所属しているプロジェクトはまだありません");

    submitCreate("New");

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
    expect(screen.getByLabelText("名前")).toHaveValue("New");
  });

  it("作成後の再取得に失敗しても、表示中の一覧は残し、エラーを併記する", async () => {
    vi.mocked(api.GET)
      .mockResolvedValueOnce(ok([project({ id: 1, name: "Alpha" })]))
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.mocked(api.POST).mockResolvedValue(ok(project({ id: 9, name: "New" }), 201));
    renderApp();
    await screen.findByRole("cell", { name: "Alpha" });

    submitCreate("New");

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
    expect(screen.getByRole("cell", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("プロジェクトを作成しました"); // 作成自体は成功している
  });

  it("作成中はボタンを押せない(二重送信の防止)", async () => {
    vi.mocked(api.GET).mockResolvedValue(ok([]));
    vi.mocked(api.POST).mockReturnValue(new Promise(() => {}) as never);
    renderApp();
    await screen.findByText("所属しているプロジェクトはまだありません");

    submitCreate("New");

    expect(await screen.findByRole("button", { name: "作成する" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));
    expect(api.POST).toHaveBeenCalledTimes(1);
  });

  // Backend と同じ上限値を指定する(UI の maxLength は UTF-16 のコード単位で数えるため、絵文字などでは Backend より少し厳しい)。
  it("名前は必須・100 文字以内、説明は 2000 文字以内", async () => {
    vi.mocked(api.GET).mockResolvedValue(ok([]));
    renderApp();
    await screen.findByText("所属しているプロジェクトはまだありません");

    expect(screen.getByLabelText("名前")).toBeRequired();
    expect(screen.getByLabelText("名前")).toHaveAttribute("maxLength", "100");
    expect(screen.getByLabelText("説明")).toHaveAttribute("maxLength", "2000");
  });
});
