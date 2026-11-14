import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { api } from "../api/client";
import type { Member } from "../api/members";
import type { Project, Role } from "../api/projects";
import type { Task } from "../api/tasks";
import { sessionStore } from "../auth/session";

vi.mock("../api/client", () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }));

const user = { id: 1, email: "alice@example.com", name: "Alice", createdAt: "2026-01-01T00:00:00Z" };

const alice: Member = { userId: 1, email: "alice@example.com", name: "Alice", role: "owner" };
const bob: Member = { userId: 2, email: "bob@example.com", name: "Bob", role: "member" };

function project(role: Role): Project {
  return { id: 1, name: "Alpha", description: "", role, createdAt: "2026-01-01T00:00:00Z" };
}

const design: Task = {
  id: 7,
  projectId: 1,
  title: "設計",
  description: "画面の設計",
  status: "todo",
  assigneeId: 2,
  createdBy: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
};

function ok<T>(data: T, status = 200) {
  return { data, response: { ok: true, status } } as never;
}

function fail(status: number, message = "error") {
  return { error: { code: "error", message }, response: { ok: false, status } } as never;
}

// Task 詳細・プロジェクト詳細・メンバー一覧・Task 一覧を、パスごとに返す。
function mockGet({
  task = ok(design),
  detail = ok(project("owner")),
  members = ok([alice, bob]),
  tasks = ok({ items: [design], total: 1, limit: 20, offset: 0 }),
}: {
  task?: unknown;
  detail?: unknown;
  members?: unknown;
  tasks?: unknown;
} = {}) {
  const responses: Record<string, unknown> = {
    "/api/tasks/{taskId}": task,
    "/api/projects/{projectId}": detail,
    "/api/projects/{projectId}/members": members,
    "/api/projects/{projectId}/tasks": tasks,
  };
  vi.mocked(api.GET).mockImplementation(((path: string) => Promise.resolve(responses[path] ?? ok([]))) as never);
}

function getCalls(path: string) {
  return vi.mocked(api.GET).mock.calls.filter((call) => call[0] === path);
}

function renderApp(path = "/tasks/7") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function editForm() {
  return within(screen.getByRole("form", { name: "Task を編集" }));
}

async function submitEdit(title: string, description: string) {
  fireEvent.click(await screen.findByRole("button", { name: "編集する" }));
  fireEvent.change(editForm().getByLabelText("タイトル"), { target: { value: title } });
  fireEvent.change(editForm().getByLabelText("説明"), { target: { value: description } });
  fireEvent.click(editForm().getByRole("button", { name: "保存する" }));
}

// 定義リスト(dt / dd)から、項目名に対応する値を取り出す。
function field(term: string) {
  return screen.getByText(term, { selector: "dt" }).nextElementSibling;
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStore.set({ token: "jwt", expiresAt: "2999-01-01T00:00:00Z", user });
});

describe("Task 詳細", () => {
  it.each(["owner", "member", "viewer"] as const)("%s にも、タイトル・説明・ステータス・担当者を表示する", async (role) => {
    mockGet({ detail: ok(project(role)) });
    renderApp();

    expect(await screen.findByRole("heading", { name: "設計", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("画面の設計")).toBeInTheDocument();
    expect(field("ステータス")).toHaveTextContent("未着手");
    await waitFor(() => expect(field("担当者")).toHaveTextContent("Bob"));
    expect(api.GET).toHaveBeenCalledWith("/api/tasks/{taskId}", { params: { path: { taskId: 7 } } });
    // ロールと担当者の名前は、Task が属するプロジェクトから取得する
    expect(api.GET).toHaveBeenCalledWith("/api/projects/{projectId}", { params: { path: { projectId: 1 } } });
  });

  it("担当者が未設定なら「未割り当て」、説明が空なら説明を表示しない", async () => {
    mockGet({ task: ok({ ...design, assigneeId: null, description: "" }) });
    renderApp();
    await screen.findByRole("heading", { name: "設計", level: 1 });

    expect(field("担当者")).toHaveTextContent("未割り当て");
    expect(screen.queryByText("画面の設計")).not.toBeInTheDocument();
  });

  it("プロジェクトへ戻るリンクを表示する", async () => {
    mockGet();
    renderApp();

    expect(await screen.findByRole("link", { name: "「Alpha」へ戻る" })).toHaveAttribute("href", "/projects/1");
  });

  it("プロジェクトの Task 一覧のタイトルから詳細へ移動できる", async () => {
    mockGet();
    renderApp("/projects/1");

    fireEvent.click(await screen.findByRole("link", { name: "設計" }));

    expect(await screen.findByRole("heading", { name: "設計", level: 1 })).toBeInTheDocument();
  });

  it("読み込み中は、その旨を表示する", async () => {
    mockGet({ task: new Promise(() => {}) });
    renderApp();

    expect(await screen.findByText("読み込み中...")).toHaveAttribute("aria-busy", "true");
  });

  it("404 なら、見つからない旨と一覧へのリンクを表示する", async () => {
    mockGet({ task: fail(404) });
    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("Task が見つかりません");
    expect(screen.getByRole("link", { name: "プロジェクト一覧へ戻る" })).toHaveAttribute("href", "/projects");
  });

  it.each(["abc", "0", "-1", "1.5", "99999999999999999999"])(
    "URL の ID が不正(%s)なら、API を呼ばずに見つからない旨を表示する",
    async (id) => {
      renderApp(`/tasks/${id}`);

      expect(await screen.findByRole("alert")).toHaveTextContent("Task が見つかりません");
      expect(api.GET).not.toHaveBeenCalled();
    },
  );

  it("API がエラーを返したら、エラーを表示する", async () => {
    mockGet({ task: fail(500) });
    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("エラーが発生しました");
  });

  it("プロジェクトを取得できなければ、エラーを表示し、操作を表示しない", async () => {
    mockGet({ detail: fail(500) });
    renderApp();
    await screen.findByRole("heading", { name: "設計", level: 1 });

    expect(await screen.findByRole("alert")).toHaveTextContent("エラーが発生しました");
    expect(screen.queryByRole("button", { name: "編集する" })).not.toBeInTheDocument();
  });
});

describe("Task 編集", () => {
  // 権限マトリクス: Task 作成・編集は owner / member のみ
  it.each(["owner", "member"] as const)("%s には編集を表示する", async (role) => {
    mockGet({ detail: ok(project(role)) });
    renderApp();

    expect(await screen.findByRole("button", { name: "編集する" })).toBeInTheDocument();
  });

  it("viewer には編集を表示しない", async () => {
    mockGet({ detail: ok(project("viewer")) });
    renderApp();
    await screen.findByRole("link", { name: "「Alpha」へ戻る" });

    expect(screen.queryByRole("button", { name: "編集する" })).not.toBeInTheDocument();
  });

  it("変更した項目だけを送り、表示を更新して、プロジェクトの Task 一覧を取り直す", async () => {
    mockGet();
    vi.mocked(api.PATCH).mockResolvedValue(ok({ ...design, title: "設計 2" }));
    renderApp("/projects/1");
    fireEvent.click(await screen.findByRole("link", { name: "設計" }));

    await submitEdit("設計 2", "画面の設計");

    expect(await screen.findByRole("status")).toHaveTextContent("Task を更新しました");
    expect(api.PATCH).toHaveBeenCalledWith("/api/tasks/{taskId}", {
      params: { path: { taskId: 7 } },
      body: { title: "設計 2" },
    });
    expect(screen.getByRole("heading", { name: "設計 2", level: 1 })).toBeInTheDocument();
    // 詳細は応答で置き換える(取り直さない)
    expect(getCalls("/api/tasks/{taskId}")).toHaveLength(1);

    // 一覧は、プロジェクトへ戻ったときに取り直す
    mockGet({ tasks: ok({ items: [{ ...design, title: "設計 2" }], total: 1, limit: 20, offset: 0 }) });
    fireEvent.click(screen.getByRole("link", { name: "「Alpha」へ戻る" }));

    expect(await screen.findByRole("link", { name: "設計 2" })).toBeInTheDocument();
  });

  it("説明を空にすると、空文字を送る", async () => {
    mockGet();
    vi.mocked(api.PATCH).mockResolvedValue(ok({ ...design, description: "" }));
    renderApp();

    await submitEdit("設計", "");

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(api.PATCH).toHaveBeenCalledWith("/api/tasks/{taskId}", {
      params: { path: { taskId: 7 } },
      body: { description: "" },
    });
  });

  it("何も変更していなければ、API を呼ばずにフォームを閉じる", async () => {
    mockGet();
    renderApp();

    await submitEdit("設計", "画面の設計");

    expect(api.PATCH).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "設計", level: 1 })).toBeInTheDocument();
  });

  it("キャンセルすると、API を呼ばずにフォームを閉じる", async () => {
    mockGet();
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "編集する" }));
    fireEvent.change(editForm().getByLabelText("タイトル"), { target: { value: "変更" } });

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(api.PATCH).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "設計", level: 1 })).toBeInTheDocument();
  });

  it("入力値の検証エラー(422)は、詳細を添えて表示し、入力を残す", async () => {
    mockGet();
    vi.mocked(api.PATCH).mockResolvedValue(fail(422, "title is required"));
    renderApp();

    await submitEdit(" ", "画面の設計");

    expect(await screen.findByRole("alert")).toHaveTextContent("入力内容を確認してください(title is required)");
    expect(editForm().getByLabelText("タイトル")).toHaveValue(" ");
  });

  it("権限が無ければ(403)、Task とプロジェクトを取り直し、現在のロールで表示する", async () => {
    mockGet();
    vi.mocked(api.PATCH).mockResolvedValue(fail(403));
    renderApp();
    await screen.findByRole("button", { name: "編集する" });

    mockGet({ detail: ok(project("viewer")) });
    await submitEdit("設計 2", "画面の設計");

    // 編集フォームを閉じ、編集の操作も表示しない
    await waitFor(() => expect(screen.queryByRole("form", { name: "Task を編集" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "編集する" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "設計", level: 1 })).toBeInTheDocument();
    expect(getCalls("/api/projects/{projectId}")).toHaveLength(2);
  });

  it("編集が 404 なら、古い内容と操作を残さず、見つからない旨を表示する", async () => {
    mockGet();
    vi.mocked(api.PATCH).mockResolvedValue(fail(404));
    renderApp();
    await screen.findByRole("button", { name: "編集する" });

    mockGet({ task: fail(404) });
    await submitEdit("設計 2", "画面の設計");

    await waitFor(() => expect(screen.queryByRole("form", { name: "Task を編集" })).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Task が見つかりません");
    expect(screen.queryByRole("heading", { name: "設計", level: 1 })).not.toBeInTheDocument();
  });

  it("保存中はボタンを押せない(二重送信の防止)", async () => {
    mockGet();
    vi.mocked(api.PATCH).mockReturnValue(new Promise(() => {}) as never);
    renderApp();

    await submitEdit("設計 2", "画面の設計");

    expect(await editForm().findByRole("button", { name: "保存する" })).toBeDisabled();
    expect(editForm().getByRole("button", { name: "キャンセル" })).toBeDisabled();
  });

  it("タイトルは必須・200 文字以内、説明は 10000 文字以内。現在の値を初期値にする", async () => {
    mockGet();
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "編集する" }));

    expect(editForm().getByLabelText("タイトル")).toBeRequired();
    expect(editForm().getByLabelText("タイトル")).toHaveAttribute("maxLength", "200");
    expect(editForm().getByLabelText("タイトル")).toHaveValue("設計");
    expect(editForm().getByLabelText("説明")).toHaveAttribute("maxLength", "10000");
    expect(editForm().getByLabelText("説明")).toHaveValue("画面の設計");
  });
});
