import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { api } from "../api/client";
import type { Comment } from "../api/comments";
import type { Member } from "../api/members";
import type { Project, Role } from "../api/projects";
import type { Task } from "../api/tasks";
import { sessionStore } from "../auth/session";

vi.mock("../api/client", () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }));

// ログイン中のユーザー(userId: 1)
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
  description: "",
  status: "todo",
  assigneeId: null,
  createdBy: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function comment(overrides: Partial<Comment>): Comment {
  return {
    id: 1,
    taskId: 7,
    userId: 1,
    body: "コメント",
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function ok<T>(data: T, status = 200) {
  return { data, response: { ok: true, status } } as never;
}

function fail(status: number, message = "error") {
  return { error: { code: "error", message }, response: { ok: false, status } } as never;
}

// Task 詳細・プロジェクト詳細・メンバー一覧・コメント一覧を、パスごとに返す。
function mockGet({
  task = ok(design),
  detail = ok(project("owner")),
  members = ok([alice, bob]),
  comments = ok([]),
}: {
  task?: unknown;
  detail?: unknown;
  members?: unknown;
  comments?: unknown;
} = {}) {
  const responses: Record<string, unknown> = {
    "/api/tasks/{taskId}": task,
    "/api/projects/{projectId}": detail,
    "/api/projects/{projectId}/members": members,
    "/api/tasks/{taskId}/comments": comments,
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

async function commentsSection() {
  return within((await screen.findByRole("heading", { name: "コメント", level: 2 })).closest("section")!);
}

function postForm() {
  return within(screen.getByRole("form", { name: "コメントを投稿" }));
}

function submitPost(body: string) {
  fireEvent.change(postForm().getByLabelText("コメント"), { target: { value: body } });
  fireEvent.click(postForm().getByRole("button", { name: "投稿する" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStore.set({ token: "jwt", expiresAt: "2999-01-01T00:00:00Z", user });
});

describe("コメント一覧", () => {
  it.each(["owner", "member", "viewer"] as const)("%s にも、投稿者・本文を古い順に表示する", async (role) => {
    mockGet({
      detail: ok(project(role)),
      comments: ok([
        comment({ id: 1, userId: 2, body: "最初のコメント" }),
        comment({ id: 2, userId: 1, body: "1行目\n2行目" }),
        // メンバーでない投稿者(外れたなど)は ID で表示する
        comment({ id: 3, userId: 9, body: "外れた人のコメント" }),
      ]),
    });
    renderApp();
    const section = await commentsSection();

    const list = await section.findByRole("list", { name: "コメント一覧" });
    await waitFor(() =>
      expect(within(list).getAllByRole("listitem").map((item) => within(item).getByRole("strong").textContent)).toEqual([
        "Bob",
        "Alice",
        "ユーザー #9",
      ]),
    );
    expect(within(list).getByText("最初のコメント")).toBeInTheDocument();
    // 改行をそのまま表示する
    expect(within(list).getByText(/1行目/)).toHaveStyle({ whiteSpace: "pre-line" });
    expect(api.GET).toHaveBeenCalledWith("/api/tasks/{taskId}/comments", { params: { path: { taskId: 7 } } });
  });

  it("編集されたコメントには「(編集済み)」を表示する", async () => {
    mockGet({
      comments: ok([
        comment({ id: 1, body: "編集していない" }),
        comment({ id: 2, body: "編集した", updatedAt: "2026-01-03T00:00:00Z" }),
      ]),
    });
    renderApp();
    const section = await commentsSection();
    const [first, second] = within(await section.findByRole("list", { name: "コメント一覧" })).getAllByRole("listitem");

    expect(within(first!).queryByText("(編集済み)")).not.toBeInTheDocument();
    expect(within(second!).getByText("(編集済み)")).toBeInTheDocument();
  });

  it("コメントが無ければ、その旨を表示する", async () => {
    mockGet();
    renderApp();
    const section = await commentsSection();

    expect(await section.findByText("コメントはまだありません")).toBeInTheDocument();
    expect(section.queryByRole("list")).not.toBeInTheDocument();
  });

  it("読み込み中は、その旨を表示する", async () => {
    mockGet({ comments: new Promise(() => {}) });
    renderApp();
    const section = await commentsSection();

    expect(section.getByText("読み込み中...")).toHaveAttribute("aria-busy", "true");
  });

  it("取得できなければ(500)、エラーを表示する", async () => {
    mockGet({ comments: fail(500) });
    renderApp();
    const section = await commentsSection();

    expect(await section.findByRole("alert")).toHaveTextContent("エラーが発生しました");
  });

  it("一覧が 404(Task が削除された・外された)なら、Task を取り直し、見つからない旨を表示する", async () => {
    // Task は 1 回目だけ取得でき、取り直すと 404 になる
    let taskCalls = 0;
    vi.mocked(api.GET).mockImplementation(((path: string) => {
      if (path === "/api/tasks/{taskId}") return Promise.resolve(taskCalls++ === 0 ? ok(design) : fail(404));
      if (path === "/api/tasks/{taskId}/comments") return Promise.resolve(fail(404));
      if (path === "/api/projects/{projectId}") return Promise.resolve(ok(project("owner")));
      return Promise.resolve(ok([alice, bob]));
    }) as never);
    renderApp();

    expect(await screen.findByText("Task が見つかりません")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "コメント" })).not.toBeInTheDocument();
  });
});

describe("コメント投稿", () => {
  // 権限マトリクス: コメント投稿は owner / member のみ
  it.each(["owner", "member"] as const)("%s には投稿フォームを表示する", async (role) => {
    mockGet({ detail: ok(project(role)) });
    renderApp();

    expect(await screen.findByRole("form", { name: "コメントを投稿" })).toBeInTheDocument();
  });

  it("viewer には投稿フォームを表示しない", async () => {
    mockGet({ detail: ok(project("viewer")) });
    renderApp();
    await screen.findByRole("link", { name: "「Alpha」へ戻る" });
    await (await commentsSection()).findByText("コメントはまだありません");

    expect(screen.queryByRole("form", { name: "コメントを投稿" })).not.toBeInTheDocument();
  });

  it("ロールが分かるまで(プロジェクトの読み込み中)は、投稿フォームを表示しない", async () => {
    mockGet({ detail: new Promise(() => {}) });
    renderApp();
    await (await commentsSection()).findByText("コメントはまだありません");

    expect(screen.queryByRole("form", { name: "コメントを投稿" })).not.toBeInTheDocument();
  });

  it("投稿すると、一覧を取り直して表示し、フォームを空にする", async () => {
    const posted = comment({ id: 5, body: "新しいコメント" });
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(ok(posted, 201));
    renderApp();
    await screen.findByRole("form", { name: "コメントを投稿" });

    mockGet({ comments: ok([posted]) });
    submitPost("新しいコメント");

    expect(await postForm().findByRole("status")).toHaveTextContent("コメントを投稿しました");
    expect(api.POST).toHaveBeenCalledWith("/api/tasks/{taskId}/comments", {
      params: { path: { taskId: 7 } },
      body: { body: "新しいコメント" },
    });
    expect(await screen.findByText("新しいコメント", { selector: "p" })).toBeInTheDocument();
    expect(postForm().getByLabelText("コメント")).toHaveValue("");
    expect(getCalls("/api/tasks/{taskId}/comments")).toHaveLength(2);
  });

  it("入力値の検証エラー(422)は、詳細を添えて表示し、入力を残す", async () => {
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(fail(422, "body is required"));
    renderApp();
    await screen.findByRole("form", { name: "コメントを投稿" });

    submitPost(" ");

    expect(await postForm().findByRole("alert")).toHaveTextContent("入力内容を確認してください(body is required)");
    expect(postForm().getByLabelText("コメント")).toHaveValue(" ");
  });

  it("権限が無ければ(403)、プロジェクトを取り直し、投稿フォームを表示しない", async () => {
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(fail(403));
    renderApp();
    await screen.findByRole("form", { name: "コメントを投稿" });

    mockGet({ detail: ok(project("viewer")) });
    submitPost("コメント");

    await waitFor(() => expect(screen.queryByRole("form", { name: "コメントを投稿" })).not.toBeInTheDocument());
  });

  it("投稿が 404 なら、見つからない旨を表示する", async () => {
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(fail(404));
    renderApp();
    await screen.findByRole("form", { name: "コメントを投稿" });

    mockGet({ task: fail(404) });
    submitPost("コメント");

    expect(await screen.findByText("Task が見つかりません")).toBeInTheDocument();
  });

  it("失敗したら(500)、エラーを表示し、入力を残す", async () => {
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(fail(500));
    renderApp();
    await screen.findByRole("form", { name: "コメントを投稿" });

    submitPost("コメント");

    expect(await postForm().findByRole("alert")).toHaveTextContent("エラーが発生しました");
    expect(postForm().getByLabelText("コメント")).toHaveValue("コメント");
  });

  it("投稿中はボタンを押せない(二重送信の防止)", async () => {
    mockGet();
    vi.mocked(api.POST).mockReturnValue(new Promise(() => {}) as never);
    renderApp();
    await screen.findByRole("form", { name: "コメントを投稿" });

    submitPost("コメント");

    expect(await postForm().findByRole("button", { name: "投稿する" })).toBeDisabled();
  });

  it("本文は必須・5000 文字以内", async () => {
    mockGet();
    renderApp();
    await screen.findByRole("form", { name: "コメントを投稿" });

    expect(postForm().getByLabelText("コメント")).toBeRequired();
    expect(postForm().getByLabelText("コメント")).toHaveAttribute("maxLength", "5000");
  });
});
