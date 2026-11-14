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
    // フォームが消えても、理由は表示する
    expect(screen.getByRole("alert")).toHaveTextContent("この操作を行う権限がありません");
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

describe("コメントの編集・削除の表示(権限)", () => {
  // Alice(自分)と Bob のコメント
  const comments = ok([comment({ id: 1, userId: 1, body: "Alice のコメント" }), comment({ id: 2, userId: 2, body: "Bob のコメント" })]);

  async function renderAs(role: Role) {
    mockGet({ detail: ok(project(role)), comments });
    renderApp();
    await screen.findByText("Bob のコメント");
    await screen.findByText("Bob", { selector: "strong" });
  }

  // 権限マトリクス: コメント編集・削除は owner は全件、member は自分のみ、viewer は不可
  it("owner には、全員のコメントに編集・削除を表示する", async () => {
    await renderAs("owner");

    expect(screen.getByRole("button", { name: "Alice のコメントを編集" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alice のコメントを削除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bob のコメントを編集" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bob のコメントを削除" })).toBeInTheDocument();
  });

  it("member には、自分のコメントにだけ編集・削除を表示する", async () => {
    await renderAs("member");

    expect(screen.getByRole("button", { name: "Alice のコメントを編集" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alice のコメントを削除" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bob のコメントを編集" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bob のコメントを削除" })).not.toBeInTheDocument();
  });

  it("viewer には、自分のコメントにも編集・削除を表示しない", async () => {
    await renderAs("viewer");

    expect(screen.queryByRole("button", { name: /のコメントを(編集|削除)/ })).not.toBeInTheDocument();
  });

  it("ロールが分かるまで(プロジェクトの読み込み中)は、編集・削除を表示しない", async () => {
    mockGet({ detail: new Promise(() => {}), comments });
    renderApp();
    await screen.findByText("Bob のコメント");

    expect(screen.queryByRole("button", { name: /のコメントを(編集|削除)/ })).not.toBeInTheDocument();
  });
});

describe("コメント編集", () => {
  const own = comment({ id: 1, userId: 1, body: "元の本文" });

  function editForm() {
    return within(screen.getByRole("form", { name: "コメントを編集" }));
  }

  async function startEditing() {
    fireEvent.click(await screen.findByRole("button", { name: "Alice のコメントを編集" }));
  }

  function submitEdit(body: string) {
    fireEvent.change(editForm().getByLabelText("本文"), { target: { value: body } });
    fireEvent.click(editForm().getByRole("button", { name: "保存する" }));
  }

  it("本文を変更すると送信し、表示を応答で置き換える", async () => {
    mockGet({ comments: ok([own]) });
    vi.mocked(api.PATCH).mockResolvedValue(ok({ ...own, body: "新しい本文", updatedAt: "2026-01-03T00:00:00Z" }));
    renderApp();
    await startEditing();
    expect(editForm().getByLabelText("本文")).toHaveValue("元の本文");

    submitEdit("新しい本文");

    expect(await screen.findByRole("status")).toHaveTextContent("コメントを更新しました");
    expect(api.PATCH).toHaveBeenCalledWith("/api/comments/{commentId}", {
      params: { path: { commentId: 1 } },
      body: { body: "新しい本文" },
    });
    expect(screen.getByText("新しい本文", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("(編集済み)")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "コメントを編集" })).not.toBeInTheDocument();
  });

  it("本文を変更していなければ、API を呼ばずにフォームを閉じる", async () => {
    mockGet({ comments: ok([own]) });
    renderApp();
    await startEditing();

    submitEdit("元の本文");

    expect(api.PATCH).not.toHaveBeenCalled();
    expect(screen.queryByRole("form", { name: "コメントを編集" })).not.toBeInTheDocument();
  });

  it("キャンセルすると、API を呼ばずにフォームを閉じる", async () => {
    mockGet({ comments: ok([own]) });
    renderApp();
    await startEditing();
    fireEvent.change(editForm().getByLabelText("本文"), { target: { value: "変更" } });

    fireEvent.click(editForm().getByRole("button", { name: "キャンセル" }));

    expect(api.PATCH).not.toHaveBeenCalled();
    expect(screen.getByText("元の本文", { selector: "p" })).toBeInTheDocument();
  });

  it("入力値の検証エラー(422)は、詳細を添えて表示し、入力を残す", async () => {
    mockGet({ comments: ok([own]) });
    vi.mocked(api.PATCH).mockResolvedValue(fail(422, "body is required"));
    renderApp();
    await startEditing();

    submitEdit(" ");

    expect(await editForm().findByRole("alert")).toHaveTextContent("入力内容を確認してください(body is required)");
    expect(editForm().getByLabelText("本文")).toHaveValue(" ");
  });

  it("権限が無ければ(403)、プロジェクトを取り直し、編集フォームを閉じる", async () => {
    mockGet({ comments: ok([own]) });
    vi.mocked(api.PATCH).mockResolvedValue(fail(403));
    renderApp();
    await startEditing();

    mockGet({ detail: ok(project("viewer")), comments: ok([own]) });
    submitEdit("新しい本文");

    await waitFor(() => expect(screen.queryByRole("form", { name: "コメントを編集" })).not.toBeInTheDocument());
    // フォームが閉じても、理由は表示する
    expect(screen.getByRole("alert")).toHaveTextContent("この操作を行う権限がありません");
    expect(screen.queryByRole("button", { name: "Alice のコメントを編集" })).not.toBeInTheDocument();
    expect(screen.getByText("元の本文", { selector: "p" })).toBeInTheDocument();
  });

  it("コメントが既に削除されていた(404)なら、その旨を表示し、一覧を取り直す", async () => {
    mockGet({ comments: ok([own, comment({ id: 2, userId: 2, body: "Bob のコメント" })]) });
    vi.mocked(api.PATCH).mockResolvedValue(fail(404));
    renderApp();
    await startEditing();

    mockGet({ comments: ok([comment({ id: 2, userId: 2, body: "Bob のコメント" })]) });
    submitEdit("新しい本文");

    expect(await screen.findByText(/コメントが見つかりません/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("元の本文")).not.toBeInTheDocument());
  });

  it("保存中は、保存・キャンセルと他のコメントの操作・投稿を押せない", async () => {
    mockGet({ comments: ok([own, comment({ id: 2, userId: 2, body: "Bob のコメント" })]) });
    vi.mocked(api.PATCH).mockReturnValue(new Promise(() => {}) as never);
    renderApp();
    await startEditing();

    submitEdit("新しい本文");

    expect(await editForm().findByRole("button", { name: "保存する" })).toBeDisabled();
    expect(editForm().getByRole("button", { name: "キャンセル" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bob のコメントを削除" })).toBeDisabled();
    expect(postForm().getByRole("button", { name: "投稿する" })).toBeDisabled();
  });

  it("失敗した後にキャンセルしたら、エラーを表示しない", async () => {
    mockGet({ comments: ok([own]) });
    vi.mocked(api.PATCH).mockResolvedValue(fail(422, "body is required"));
    renderApp();
    await startEditing();
    submitEdit(" ");
    await editForm().findByRole("alert");

    fireEvent.click(editForm().getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByRole("form", { name: "コメントを編集" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("失敗した後に本文を元に戻して保存しても、エラーを表示しない", async () => {
    mockGet({ comments: ok([own]) });
    vi.mocked(api.PATCH).mockResolvedValue(fail(500));
    renderApp();
    await startEditing();
    submitEdit("新しい本文");
    await editForm().findByRole("alert");

    submitEdit("元の本文");

    expect(screen.queryByRole("form", { name: "コメントを編集" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.PATCH).toHaveBeenCalledTimes(1);
  });

  it("編集中に投稿しても、編集中の入力は残す", async () => {
    mockGet({ comments: ok([own]) });
    vi.mocked(api.POST).mockResolvedValue(ok(comment({ id: 5, body: "新しいコメント" }), 201));
    renderApp();
    await startEditing();
    fireEvent.change(editForm().getByLabelText("本文"), { target: { value: "編集中の本文" } });

    submitPost("新しいコメント");

    expect(await postForm().findByRole("status")).toHaveTextContent("コメントを投稿しました");
    expect(editForm().getByLabelText("本文")).toHaveValue("編集中の本文");
  });

  it("本文は必須・5000 文字以内", async () => {
    mockGet({ comments: ok([own]) });
    renderApp();
    await startEditing();

    expect(editForm().getByLabelText("本文")).toBeRequired();
    expect(editForm().getByLabelText("本文")).toHaveAttribute("maxLength", "5000");
  });
});

describe("コメント削除", () => {
  const own = comment({ id: 1, userId: 1, body: "消すコメント" });
  const deleted = { response: { ok: true, status: 204 } } as never;

  it("確認後に削除し、一覧を取り直す", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet({ comments: ok([own]) });
    vi.mocked(api.DELETE).mockResolvedValue(deleted);
    renderApp();
    const button = await screen.findByRole("button", { name: "Alice のコメントを削除" });

    mockGet({ comments: ok([]) });
    fireEvent.click(button);

    expect(await screen.findByText("コメントを削除しました")).toHaveAttribute("role", "status");
    expect(api.DELETE).toHaveBeenCalledWith("/api/comments/{commentId}", { params: { path: { commentId: 1 } } });
    expect(await screen.findByText("コメントはまだありません")).toBeInTheDocument();
  });

  it("確認で取り消すと、削除しない", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockGet({ comments: ok([own]) });
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Alice のコメントを削除" }));

    expect(api.DELETE).not.toHaveBeenCalled();
    expect(screen.getByText("消すコメント")).toBeInTheDocument();
  });

  it("権限が無ければ(403)、その旨を表示し、プロジェクトを取り直して削除を表示しない", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet({ comments: ok([own]) });
    vi.mocked(api.DELETE).mockResolvedValue(fail(403));
    renderApp();
    const button = await screen.findByRole("button", { name: "Alice のコメントを削除" });

    mockGet({ detail: ok(project("viewer")), comments: ok([own]) });
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("この操作を行う権限がありません");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Alice のコメントを削除" })).not.toBeInTheDocument(),
    );
  });

  it("既に削除されていた(404)なら、その旨を表示し、一覧を取り直す", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet({ comments: ok([own]) });
    vi.mocked(api.DELETE).mockResolvedValue(fail(404));
    renderApp();
    const button = await screen.findByRole("button", { name: "Alice のコメントを削除" });

    mockGet({ comments: ok([]) });
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("コメントが見つかりません");
    expect(await screen.findByText("コメントはまだありません")).toBeInTheDocument();
  });

  it("削除中は、編集・削除・投稿を押せない(二重送信の防止)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet({ comments: ok([own]) });
    vi.mocked(api.DELETE).mockReturnValue(new Promise(() => {}) as never);
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Alice のコメントを削除" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Alice のコメントを削除" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Alice のコメントを編集" })).toBeDisabled();
    expect(postForm().getByRole("button", { name: "投稿する" })).toBeDisabled();
  });
});
