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

function task(overrides: Partial<Task>): Task {
  return {
    id: 1,
    projectId: 1,
    title: "T",
    description: "",
    status: "todo",
    assigneeId: null,
    createdBy: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function page(items: Task[], total = items.length, offset = 0) {
  return ok({ items, total, limit: 20, offset });
}

function ok<T>(data: T, status = 200) {
  return { data, response: { ok: true, status } } as never;
}

function fail(status: number, message = "error") {
  return { error: { code: "error", message }, response: { ok: false, status } } as never;
}

type TaskQuery = { status?: string; assigneeId?: number; limit: number; offset: number };

// 詳細・メンバー一覧・Task 一覧を、パスごとに返す。Task 一覧はクエリに応じて返せる。
function mockGet({
  detail = ok(project("owner")),
  members = ok([alice, bob]),
  tasks = () => page([]),
}: {
  detail?: unknown;
  members?: unknown;
  tasks?: (query: TaskQuery) => unknown;
} = {}) {
  vi.mocked(api.GET).mockImplementation(((path: string, init?: { params?: { query?: TaskQuery } }) => {
    if (path === "/api/projects/{projectId}/tasks") return Promise.resolve(tasks(init!.params!.query!));
    if (path === "/api/projects/{projectId}/members") return Promise.resolve(members);
    return Promise.resolve(detail);
  }) as never);
}

function taskQueries(): TaskQuery[] {
  return vi
    .mocked(api.GET)
    .mock.calls.filter((call) => call[0] === "/api/projects/{projectId}/tasks")
    .map((call) => (call[1] as { params: { query: TaskQuery } }).params.query);
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

async function tasksSection() {
  return within((await screen.findByRole("heading", { name: "Task" })).closest("section")!);
}

function rowTexts(section: ReturnType<typeof within>) {
  return section
    .getAllByRole("row")
    .slice(1)
    .map((row: HTMLElement) =>
      within(row)
        .getAllByRole("cell")
        .slice(0, 3)
        .map((cell) => cell.textContent),
    );
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStore.set({ token: "jwt", expiresAt: "2999-01-01T00:00:00Z", user });
});

describe("Task 一覧", () => {
  it.each(["owner", "member", "viewer"] as const)("%s にも、タイトル・ステータス・担当者を表示する", async (role) => {
    mockGet({
      detail: ok(project(role)),
      tasks: () =>
        page([
          task({ id: 1, title: "設計", status: "in_progress", assigneeId: 2 }),
          task({ id: 2, title: "実装", status: "todo", assigneeId: null }),
          task({ id: 3, title: "調査", status: "done", assigneeId: 9 }),
        ]),
    });
    renderApp();
    const section = await tasksSection();

    await section.findByRole("cell", { name: "設計" });
    await waitFor(() =>
      expect(rowTexts(section)).toEqual([
        ["設計", "進行中", "Bob"],
        ["実装", "未着手", "未割り当て"],
        // メンバーでない担当者(取得後に外れたなど)は ID で表示する
        ["調査", "完了", "ユーザー #9"],
      ]),
    );
    expect(taskQueries()[0]).toEqual({ status: undefined, assigneeId: undefined, limit: 20, offset: 0 });
  });

  it("Task が無ければ、その旨を表示する", async () => {
    mockGet();
    renderApp();
    const section = await tasksSection();

    expect(await section.findByText("Task はまだありません")).toBeInTheDocument();
    expect(section.queryByRole("table")).not.toBeInTheDocument();
    expect(section.queryByRole("navigation", { name: "ページ" })).not.toBeInTheDocument();
  });

  it("読み込み中は、その旨を表示する", async () => {
    mockGet({ tasks: () => new Promise(() => {}) });
    renderApp();
    const section = await tasksSection();

    expect(section.getByText("読み込み中...")).toHaveAttribute("aria-busy", "true");
  });

  it("取得できなければ、エラーを表示する", async () => {
    mockGet({ tasks: () => fail(500) });
    renderApp();
    const section = await tasksSection();

    expect(await section.findByRole("alert")).toHaveTextContent("エラーが発生しました");
    expect(section.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("Task の絞り込み", () => {
  it("ステータスで絞り込む", async () => {
    mockGet({ tasks: (query) => page(query.status === "done" ? [task({ title: "完了した Task", status: "done" })] : []) });
    renderApp();
    const section = await tasksSection();
    await section.findByText("Task はまだありません");

    fireEvent.change(section.getByLabelText("ステータス"), { target: { value: "done" } });

    expect(await section.findByRole("cell", { name: "完了した Task" })).toBeInTheDocument();
    expect(taskQueries().at(-1)).toMatchObject({ status: "done", offset: 0 });
  });

  it("担当者の選択肢はメンバー一覧で、選ぶとその担当者で絞り込む", async () => {
    mockGet({ tasks: (query) => page(query.assigneeId === 2 ? [task({ title: "Bob の Task", assigneeId: 2 })] : []) });
    renderApp();
    const section = await tasksSection();
    const select = section.getByLabelText("担当者");
    await within(select).findByRole("option", { name: "Bob" });

    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "すべて",
      "Alice",
      "Bob",
    ]);
    fireEvent.change(select, { target: { value: "2" } });

    expect(await section.findByRole("cell", { name: "Bob の Task" })).toBeInTheDocument();
    expect(taskQueries().at(-1)).toMatchObject({ assigneeId: 2, offset: 0 });
  });

  it("絞り込みで一致しなければ、その旨を表示する", async () => {
    mockGet({ tasks: (query) => page(query.status ? [] : [task({ title: "設計" })]) });
    renderApp();
    const section = await tasksSection();
    await section.findByRole("cell", { name: "設計" });

    fireEvent.change(section.getByLabelText("ステータス"), { target: { value: "done" } });

    expect(await section.findByText("条件に一致する Task はありません")).toBeInTheDocument();
  });
});

describe("Task のページネーション", () => {
  // 45 件を 20 件ずつ返す
  const all = Array.from({ length: 45 }, (_, i) => task({ id: i + 1, title: `Task ${i + 1}` }));
  const paged = (query: TaskQuery) => page(all.slice(query.offset, query.offset + query.limit), all.length, query.offset);

  it("20 件ずつ表示し、次へ・前へでページを移る", async () => {
    mockGet({ tasks: paged });
    renderApp();
    const section = await tasksSection();
    await section.findByRole("cell", { name: "Task 1" });

    const nav = within(section.getByRole("navigation", { name: "ページ" }));
    expect(nav.getByText("全 45 件中 1〜20 件")).toBeInTheDocument();
    expect(nav.getByRole("button", { name: "前へ" })).toBeDisabled();

    fireEvent.click(nav.getByRole("button", { name: "次へ" }));
    expect(await section.findByRole("cell", { name: "Task 21" })).toBeInTheDocument();
    expect(nav.getByText("全 45 件中 21〜40 件")).toBeInTheDocument();

    fireEvent.click(nav.getByRole("button", { name: "次へ" }));
    expect(await section.findByRole("cell", { name: "Task 41" })).toBeInTheDocument();
    expect(nav.getByText("全 45 件中 41〜45 件")).toBeInTheDocument();
    expect(nav.getByRole("button", { name: "次へ" })).toBeDisabled();

    fireEvent.click(nav.getByRole("button", { name: "前へ" }));
    expect(await section.findByRole("cell", { name: "Task 21" })).toBeInTheDocument();
    expect(taskQueries().map((query) => query.offset)).toEqual([0, 20, 40, 20]);
  });

  it("絞り込みを変えたら、1 ページ目に戻る", async () => {
    mockGet({ tasks: paged });
    renderApp();
    const section = await tasksSection();
    await section.findByRole("cell", { name: "Task 1" });
    fireEvent.click(section.getByRole("button", { name: "次へ" }));
    await section.findByRole("cell", { name: "Task 21" });

    fireEvent.change(section.getByLabelText("ステータス"), { target: { value: "todo" } });

    await waitFor(() => expect(taskQueries().at(-1)).toMatchObject({ status: "todo", offset: 0 }));
  });

  it("1 ページに収まるなら、ページの操作を表示しない", async () => {
    mockGet({ tasks: () => page([task({ title: "設計" })]) });
    renderApp();
    const section = await tasksSection();
    await section.findByRole("cell", { name: "設計" });

    expect(section.queryByRole("navigation", { name: "ページ" })).not.toBeInTheDocument();
  });
});

describe("Task 作成", () => {
  // 詳細画面にはプロジェクトの説明もあるため、作成フォームの中で探す。
  function createForm() {
    return within(screen.getByRole("form", { name: "Task を作成" }));
  }

  function submitCreate(title: string, description: string) {
    fireEvent.change(screen.getByLabelText("タイトル"), { target: { value: title } });
    fireEvent.change(createForm().getByLabelText("説明"), { target: { value: description } });
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));
  }

  // 権限マトリクス: Task 作成は owner / member のみ
  it.each(["owner", "member"] as const)("%s には作成フォームを表示する", async (role) => {
    mockGet({ detail: ok(project(role)) });
    renderApp();
    const section = await tasksSection();

    expect(section.getByRole("button", { name: "作成する" })).toBeInTheDocument();
  });

  it("viewer には作成フォームを表示しない", async () => {
    mockGet({ detail: ok(project("viewer")) });
    renderApp();
    const section = await tasksSection();
    await section.findByText("Task はまだありません");

    expect(section.queryByRole("button", { name: "作成する" })).not.toBeInTheDocument();
    expect(section.queryByLabelText("タイトル")).not.toBeInTheDocument();
  });

  it("作成すると、一覧を取り直して表示し、フォームを空にする", async () => {
    const created = task({ id: 9, title: "新しい Task", description: "説明" });
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(ok(created, 201));
    renderApp();
    const section = await tasksSection();
    await section.findByText("Task はまだありません");

    mockGet({ tasks: () => page([created]) });
    submitCreate("新しい Task", "説明");

    expect(await section.findByRole("status")).toHaveTextContent("「新しい Task」を作成しました");
    expect(api.POST).toHaveBeenCalledWith("/api/projects/{projectId}/tasks", {
      params: { path: { projectId: 1 } },
      body: { title: "新しい Task", description: "説明" },
    });
    expect(await section.findByRole("cell", { name: "新しい Task" })).toBeInTheDocument();
    expect(screen.getByLabelText("タイトル")).toHaveValue("");
    expect(createForm().getByLabelText("説明")).toHaveValue("");
  });

  it("作成すると、絞り込みを外して 1 ページ目に戻る", async () => {
    const created = task({ id: 9, title: "新しい Task" });
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(ok(created, 201));
    renderApp();
    const section = await tasksSection();
    fireEvent.change(section.getByLabelText("ステータス"), { target: { value: "done" } });
    await section.findByText("条件に一致する Task はありません");

    mockGet({ tasks: (query) => page(query.status ? [] : [created]) });
    submitCreate("新しい Task", "");

    expect(await section.findByRole("cell", { name: "新しい Task" })).toBeInTheDocument();
    expect(section.getByLabelText("ステータス")).toHaveValue("");
    expect(taskQueries().at(-1)).toEqual({ status: undefined, assigneeId: undefined, limit: 20, offset: 0 });
  });

  it("入力値の検証エラー(422)は、詳細を添えて表示し、入力を残す", async () => {
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(fail(422, "title is required"));
    renderApp();
    await tasksSection();

    submitCreate(" ", "説明");

    expect(await screen.findByRole("alert")).toHaveTextContent("入力内容を確認してください(title is required)");
    expect(createForm().getByLabelText("説明")).toHaveValue("説明");
  });

  it("権限が無ければ(403)、詳細を取り直し、作成フォームを表示しない", async () => {
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(fail(403));
    renderApp();
    await tasksSection();

    mockGet({ detail: ok(project("viewer")) });
    submitCreate("新しい Task", "");

    expect(await screen.findByText("あなたのロール: 閲覧者")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "作成する" })).not.toBeInTheDocument();
  });

  it("作成中はボタンを押せない(二重送信の防止)", async () => {
    mockGet();
    vi.mocked(api.POST).mockReturnValue(new Promise(() => {}) as never);
    renderApp();
    await tasksSection();

    submitCreate("新しい Task", "");

    expect(await screen.findByRole("button", { name: "作成する" })).toBeDisabled();
  });

  it("タイトルは必須・200 文字以内、説明は 10000 文字以内", async () => {
    mockGet();
    renderApp();
    await tasksSection();

    expect(screen.getByLabelText("タイトル")).toBeRequired();
    expect(screen.getByLabelText("タイトル")).toHaveAttribute("maxLength", "200");
    expect(createForm().getByLabelText("説明")).toHaveAttribute("maxLength", "10000");
  });
});

describe("Task 一覧の 404・メンバーの変化", () => {
  it("一覧が 404(削除された・外された)なら、詳細を取り直し、見つからない旨を表示する", async () => {
    // 詳細は 1 回目だけ取得でき、取り直すと 404 になる
    let detailCalls = 0;
    vi.mocked(api.GET).mockImplementation(((path: string) => {
      if (path === "/api/projects/{projectId}/tasks") return Promise.resolve(fail(404));
      if (path === "/api/projects/{projectId}/members") return Promise.resolve(ok([alice, bob]));
      return Promise.resolve(detailCalls++ === 0 ? ok(project("owner")) : fail(404));
    }) as never);
    renderApp();

    expect(await screen.findByText("プロジェクトが見つかりません")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Alpha", level: 1 })).not.toBeInTheDocument();
  });

  it("作成が 404 なら、詳細を取り直し、見つからない旨を表示する", async () => {
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(fail(404));
    renderApp();
    await tasksSection();

    mockGet({ detail: fail(404) });
    fireEvent.change(screen.getByLabelText("タイトル"), { target: { value: "新しい Task" } });
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));

    expect(await screen.findByText("プロジェクトが見つかりません")).toBeInTheDocument();
  });

  it("メンバーを外すと Task 一覧を取り直し、外した人の担当は「未割り当て」になる", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet({ tasks: () => page([task({ title: "設計", assigneeId: 2 })]) });
    vi.mocked(api.DELETE).mockResolvedValue({ response: { ok: true, status: 204 } } as never);
    renderApp();
    const section = await tasksSection();
    await waitFor(() => expect(rowTexts(section)).toEqual([["設計", "未着手", "Bob"]]));

    // Backend は外したメンバーの担当を解除する
    mockGet({ members: ok([alice]), tasks: () => page([task({ title: "設計", assigneeId: null })]) });
    fireEvent.click(screen.getByRole("button", { name: "Bob を外す" }));

    await waitFor(() => expect(rowTexts(section)).toEqual([["設計", "未着手", "未割り当て"]]));
  });

  it("絞り込み中の担当者がメンバーから外れても、絞り込み中であることを表示する", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet();
    vi.mocked(api.DELETE).mockResolvedValue({ response: { ok: true, status: 204 } } as never);
    renderApp();
    const section = await tasksSection();
    const select = section.getByLabelText("担当者");
    await within(select).findByRole("option", { name: "Bob" });
    fireEvent.change(select, { target: { value: "2" } });

    mockGet({ members: ok([alice]) });
    fireEvent.click(screen.getByRole("button", { name: "Bob を外す" }));

    expect(await within(select).findByRole("option", { name: "ユーザー #2" })).toBeInTheDocument();
    expect(select).toHaveValue("2");
  });
});

describe("Task のページネーション(境界・エラー)", () => {
  const all = Array.from({ length: 45 }, (_, i) => task({ id: i + 1, title: `Task ${i + 1}` }));
  const paged = (query: TaskQuery) => page(all.slice(query.offset, query.offset + query.limit), all.length, query.offset);

  it("次のページを読み込んでいる間は、前の結果を表示したままページの操作を押せない", async () => {
    mockGet({ tasks: (query) => (query.offset === 0 ? paged(query) : new Promise(() => {})) });
    renderApp();
    const section = await tasksSection();
    await section.findByRole("cell", { name: "Task 1" });

    fireEvent.click(section.getByRole("button", { name: "次へ" }));

    await waitFor(() => expect(section.getByRole("button", { name: "次へ" })).toBeDisabled());
    expect(section.getByRole("button", { name: "前へ" })).toBeDisabled();
    expect(section.getByRole("cell", { name: "Task 1" })).toBeInTheDocument();
    // 件数の表示は、表示中の(前の)結果に合わせる
    expect(section.getByText("全 45 件中 1〜20 件")).toBeInTheDocument();
  });

  it("表示中に件数が減って範囲外のページになったら、その旨を表示し、前へで最後のページに戻る", async () => {
    // 3 ページ目(offset 40)を開いた時点で、他の人の削除により 40 件に減っている
    mockGet({
      tasks: (query) =>
        query.offset === 40 ? page([], 40, 40) : page(all.slice(query.offset, query.offset + 20), 45, query.offset),
    });
    renderApp();
    const section = await tasksSection();
    await section.findByRole("cell", { name: "Task 1" });
    fireEvent.click(section.getByRole("button", { name: "次へ" }));
    await section.findByRole("cell", { name: "Task 21" });
    fireEvent.click(section.getByRole("button", { name: "次へ" }));

    expect(await section.findByText("このページに Task はありません")).toBeInTheDocument();
    expect(section.getByText("全 40 件")).toBeInTheDocument();

    fireEvent.click(section.getByRole("button", { name: "前へ" }));
    expect(await section.findByRole("cell", { name: "Task 21" })).toBeInTheDocument();
    expect(taskQueries().map((query) => query.offset)).toEqual([0, 20, 40, 20]);
  });

  it("まだ取得していないページで失敗したら、エラーと再読み込みを表示する", async () => {
    let failOnce = true;
    mockGet({
      tasks: (query) => {
        if (query.offset === 20 && failOnce) {
          failOnce = false;
          return fail(500);
        }
        return paged(query);
      },
    });
    renderApp();
    const section = await tasksSection();
    await section.findByRole("cell", { name: "Task 1" });
    fireEvent.click(section.getByRole("button", { name: "次へ" }));

    expect(await section.findByRole("alert")).toHaveTextContent("エラーが発生しました");
    fireEvent.click(section.getByRole("button", { name: "再読み込み" }));

    expect(await section.findByRole("cell", { name: "Task 21" })).toBeInTheDocument();
  });

  it("ステータスと担当者を両方指定して絞り込む", async () => {
    mockGet();
    renderApp();
    const section = await tasksSection();
    await within(section.getByLabelText("担当者")).findByRole("option", { name: "Bob" });

    fireEvent.change(section.getByLabelText("ステータス"), { target: { value: "in_progress" } });
    fireEvent.change(section.getByLabelText("担当者"), { target: { value: "2" } });

    await waitFor(() =>
      expect(taskQueries().at(-1)).toEqual({ status: "in_progress", assigneeId: 2, limit: 20, offset: 0 }),
    );
  });

  it("担当者の絞り込みを変えても、1 ページ目に戻る", async () => {
    mockGet({ tasks: paged });
    renderApp();
    const section = await tasksSection();
    await section.findByRole("cell", { name: "Task 1" });
    fireEvent.click(section.getByRole("button", { name: "次へ" }));
    await section.findByRole("cell", { name: "Task 21" });

    fireEvent.change(section.getByLabelText("担当者"), { target: { value: "2" } });

    await waitFor(() => expect(taskQueries().at(-1)).toMatchObject({ assigneeId: 2, offset: 0 }));
  });
});
