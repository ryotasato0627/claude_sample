import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { api } from "../api/client";
import type { Project } from "../api/projects";
import { sessionStore } from "../auth/session";

vi.mock("../api/client", () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }));

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

function renderApp(path = "/projects/1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const alpha = project({ id: 1, name: "Alpha", description: "説明", role: "owner" });

// 詳細は GET /api/projects/{projectId}、一覧は GET /api/projects で返す。
function mockGet(detail: unknown, list: unknown = ok([])) {
  vi.mocked(api.GET).mockImplementation(((path: string) =>
    Promise.resolve(path === "/api/projects" ? list : detail)) as never);
}

function submitEdit(name: string, description: string) {
  fireEvent.click(screen.getByRole("button", { name: "編集する" }));
  fireEvent.change(screen.getByLabelText("名前"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("説明"), { target: { value: description } });
  fireEvent.click(screen.getByRole("button", { name: "保存する" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStore.set({ token: "jwt", expiresAt: "2999-01-01T00:00:00Z", user });
});

describe("プロジェクト詳細", () => {
  it("名前・説明・自分のロールを表示する", async () => {
    mockGet(ok(project({ id: 1, name: "Alpha", description: "1行目\n2行目", role: "member" })));
    renderApp();

    expect(await screen.findByRole("heading", { name: "Alpha", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/1行目/)).toHaveStyle({ whiteSpace: "pre-line" });
    expect(screen.getByText("あなたのロール: メンバー")).toBeInTheDocument();
    expect(api.GET).toHaveBeenCalledWith("/api/projects/{projectId}", { params: { path: { projectId: 1 } } });
  });

  // 権限マトリクス: プロジェクト編集・削除は owner のみ
  it("owner には編集・削除を表示する", async () => {
    mockGet(ok(alpha));
    renderApp();

    expect(await screen.findByRole("button", { name: "編集する" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "削除する" })).toBeInTheDocument();
  });

  it.each(["member", "viewer"] as const)("%s には編集・削除を表示しない", async (role) => {
    mockGet(ok(project({ name: "Alpha", role })));
    renderApp();

    expect(await screen.findByRole("heading", { name: "Alpha", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編集する" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "削除する" })).not.toBeInTheDocument();
  });

  it("読み込み中は、その旨を表示する", async () => {
    vi.mocked(api.GET).mockReturnValue(new Promise(() => {}) as never);
    renderApp();

    expect(await screen.findByText("読み込み中...")).toHaveAttribute("aria-busy", "true");
  });

  // 存在しない、またはメンバーではないプロジェクトは 404(存在を知らせない)
  it("404 なら、見つからない旨と一覧へのリンクを表示する", async () => {
    mockGet(fail(404));
    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("プロジェクトが見つかりません");
    expect(screen.getByRole("link", { name: "プロジェクト一覧へ戻る" })).toHaveAttribute("href", "/projects");
  });

  it.each(["abc", "0", "-1", "1.5", "99999999999999999999"])(
    "URL の ID が不正(%s)なら、API を呼ばずに見つからない旨を表示する",
    async (id) => {
      renderApp(`/projects/${id}`);

      expect(await screen.findByRole("alert")).toHaveTextContent("プロジェクトが見つかりません");
      expect(api.GET).not.toHaveBeenCalled();
    },
  );

  it("API がエラーを返したら、エラーを表示する", async () => {
    mockGet(fail(500));
    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("エラーが発生しました");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("一覧のプロジェクト名から詳細へ移動できる", async () => {
    mockGet(ok(alpha), ok([alpha]));
    renderApp("/projects");
    fireEvent.click(await screen.findByRole("link", { name: "Alpha" }));

    expect(await screen.findByRole("heading", { name: "Alpha", level: 1 })).toBeInTheDocument();
  });
});

describe("プロジェクト編集", () => {
  it("変更した項目だけを送り、表示を更新する", async () => {
    mockGet(ok(alpha));
    vi.mocked(api.PATCH).mockResolvedValue(ok({ ...alpha, name: "Alpha 2" }));
    renderApp();
    await screen.findByRole("heading", { name: "Alpha", level: 1 });

    submitEdit("Alpha 2", "説明");

    expect(await screen.findByRole("heading", { name: "Alpha 2", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("プロジェクトを更新しました");
    expect(screen.queryByLabelText("名前")).not.toBeInTheDocument();
    expect(api.PATCH).toHaveBeenCalledWith("/api/projects/{projectId}", {
      params: { path: { projectId: 1 } },
      body: { name: "Alpha 2" },
    });
  });

  it("説明を空にすると、空文字を送る", async () => {
    mockGet(ok(alpha));
    vi.mocked(api.PATCH).mockResolvedValue(ok({ ...alpha, description: "" }));
    renderApp();
    await screen.findByRole("heading", { name: "Alpha", level: 1 });

    submitEdit("Alpha", "");

    expect(await screen.findByRole("status")).toHaveTextContent("プロジェクトを更新しました");
    expect(api.PATCH).toHaveBeenCalledWith("/api/projects/{projectId}", {
      params: { path: { projectId: 1 } },
      body: { description: "" },
    });
    expect(screen.queryByText("説明")).not.toBeInTheDocument();
  });

  it("何も変更していなければ、API を呼ばずにフォームを閉じる", async () => {
    mockGet(ok(alpha));
    renderApp();
    await screen.findByRole("heading", { name: "Alpha", level: 1 });

    submitEdit("Alpha", "説明");

    expect(await screen.findByRole("button", { name: "編集する" })).toBeInTheDocument();
    expect(api.PATCH).not.toHaveBeenCalled();
  });

  it("編集後は一覧を取り直す", async () => {
    mockGet(ok(alpha), ok([alpha]));
    vi.mocked(api.PATCH).mockResolvedValue(ok({ ...alpha, name: "Alpha 2" }));
    renderApp("/projects");
    fireEvent.click(await screen.findByRole("link", { name: "Alpha" }));
    await screen.findByRole("heading", { name: "Alpha", level: 1 });

    mockGet(ok({ ...alpha, name: "Alpha 2" }), ok([{ ...alpha, name: "Alpha 2" }]));
    submitEdit("Alpha 2", "説明");
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("link", { name: "プロジェクト一覧へ戻る" }));

    expect(await screen.findByRole("link", { name: "Alpha 2" })).toBeInTheDocument();
  });

  it("入力値の検証エラーは、詳細を添えて表示し、入力を残す", async () => {
    mockGet(ok(alpha));
    vi.mocked(api.PATCH).mockResolvedValue(fail(422, "name is required"));
    renderApp();
    await screen.findByRole("heading", { name: "Alpha", level: 1 });

    submitEdit(" ", "説明");

    expect(await screen.findByRole("alert")).toHaveTextContent("入力内容を確認してください(name is required)");
    expect(screen.getByLabelText("名前")).toHaveValue(" ");
    expect(screen.getByRole("heading", { name: "Alpha", level: 1 })).toBeInTheDocument();
  });

  it("権限が無ければ(403)、その旨を表示する", async () => {
    mockGet(ok(alpha));
    vi.mocked(api.PATCH).mockResolvedValue(fail(403));
    renderApp();
    await screen.findByRole("heading", { name: "Alpha", level: 1 });

    submitEdit("Alpha 2", "説明");

    expect(await screen.findByRole("alert")).toHaveTextContent("この操作を行う権限がありません");
  });

  // 他の人が削除した・メンバーから外された(404)場合は、詳細を取り直して見つからない旨を表示する
  it("編集が 404 なら、古い内容と操作ボタンを残さず、見つからない旨を表示する", async () => {
    mockGet(ok(alpha));
    vi.mocked(api.PATCH).mockResolvedValue(fail(404));
    renderApp();
    await screen.findByRole("heading", { name: "Alpha", level: 1 });

    mockGet(fail(404));
    submitEdit("Alpha 2", "説明");

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Alpha", level: 1 })).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("プロジェクトが見つかりません");
    expect(screen.getByRole("link", { name: "プロジェクト一覧へ戻る" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編集する" })).not.toBeInTheDocument();
  });

  // 編集中に owner から降格された(403)場合は、詳細を取り直して現在のロールで表示する
  it("編集が 403 なら、詳細を取り直して現在のロールで表示する", async () => {
    mockGet(ok(alpha));
    vi.mocked(api.PATCH).mockResolvedValue(fail(403));
    renderApp();
    await screen.findByRole("heading", { name: "Alpha", level: 1 });

    mockGet(ok({ ...alpha, role: "member" }));
    submitEdit("Alpha 2", "説明");

    expect(await screen.findByText("あなたのロール: メンバー")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編集する" })).not.toBeInTheDocument();
  });

  it("キャンセルすると、API を呼ばずにフォームを閉じる", async () => {
    mockGet(ok(alpha));
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "編集する" }));
    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "変更" } });
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByLabelText("名前")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alpha", level: 1 })).toBeInTheDocument();
    expect(api.PATCH).not.toHaveBeenCalled();
  });

  it("保存中はボタンを押せない(二重送信の防止)", async () => {
    mockGet(ok(alpha));
    vi.mocked(api.PATCH).mockReturnValue(new Promise(() => {}) as never);
    renderApp();
    await screen.findByRole("heading", { name: "Alpha", level: 1 });

    submitEdit("Alpha 2", "説明");

    expect(await screen.findByRole("button", { name: "保存する" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();
  });

  it("名前は必須・100 文字以内、説明は 2000 文字以内。現在の値を初期値にする", async () => {
    mockGet(ok(alpha));
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "編集する" }));

    expect(screen.getByLabelText("名前")).toBeRequired();
    expect(screen.getByLabelText("名前")).toHaveAttribute("maxLength", "100");
    expect(screen.getByLabelText("名前")).toHaveValue("Alpha");
    expect(screen.getByLabelText("説明")).toHaveAttribute("maxLength", "2000");
    expect(screen.getByLabelText("説明")).toHaveValue("説明");
  });
});

describe("プロジェクト削除", () => {
  it("確認後に削除し、一覧へ移動して削除した旨を表示する", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet(ok(alpha), ok([]));
    vi.mocked(api.DELETE).mockResolvedValue({ response: { ok: true, status: 204 } } as never);
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "削除する" }));

    expect(await screen.findByRole("status")).toHaveTextContent("「Alpha」を削除しました");
    expect(await screen.findByText("所属しているプロジェクトはまだありません")).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Alpha"));
    expect(api.DELETE).toHaveBeenCalledWith("/api/projects/{projectId}", { params: { path: { projectId: 1 } } });
    // 削除後に詳細を取り直さない(削除直後に 404 を表示しない)
    expect(vi.mocked(api.GET).mock.calls.filter((call) => call[0] === "/api/projects/{projectId}")).toHaveLength(1);
  });

  it("確認で取り消すと、削除しない", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockGet(ok(alpha));
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "削除する" }));

    expect(api.DELETE).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Alpha", level: 1 })).toBeInTheDocument();
  });

  it("削除に失敗したら、エラーを表示して画面に残る", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet(ok(alpha));
    vi.mocked(api.DELETE).mockResolvedValue(fail(403));
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "削除する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("この操作を行う権限がありません");
    expect(screen.getByRole("heading", { name: "Alpha", level: 1 })).toBeInTheDocument();
  });

  it("削除が 404 なら、見つからない旨を表示する", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet(ok(alpha));
    vi.mocked(api.DELETE).mockResolvedValue(fail(404));
    renderApp();
    await screen.findByRole("heading", { name: "Alpha", level: 1 });

    mockGet(fail(404));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "削除する" })).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("プロジェクトが見つかりません");
    expect(screen.queryByRole("heading", { name: "Alpha", level: 1 })).not.toBeInTheDocument();
  });

  it("削除中はボタンを押せない(二重送信の防止)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet(ok(alpha));
    vi.mocked(api.DELETE).mockReturnValue(new Promise(() => {}) as never);
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "削除する" }));

    expect(await screen.findByRole("button", { name: "削除する" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "編集する" })).toBeDisabled();
  });
});
