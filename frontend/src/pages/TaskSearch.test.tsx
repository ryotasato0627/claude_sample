import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { api } from "../api/client";
import type { Member } from "../api/members";
import type { Project } from "../api/projects";
import type { Task } from "../api/tasks";
import { sessionStore } from "../auth/session";

vi.mock("../api/client", () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }));

const user = { id: 1, email: "alice@example.com", name: "Alice", createdAt: "2026-01-01T00:00:00Z" };

const alpha: Project = { id: 1, name: "Alpha", description: "", role: "owner", createdAt: "2026-01-01T00:00:00Z" };
const beta: Project = { id: 2, name: "Beta", description: "", role: "viewer", createdAt: "2026-01-01T00:00:00Z" };

const alice: Member = { userId: 1, email: "alice@example.com", name: "Alice", role: "owner" };
const bob: Member = { userId: 2, email: "bob@example.com", name: "Bob", role: "member" };
const carol: Member = { userId: 3, email: "carol@example.com", name: "Carol", role: "owner" };

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

type SearchQuery = { q?: string; projectId?: number; status?: string; assigneeId?: number; limit: number; offset: number };

// 検索・プロジェクト一覧・メンバー一覧(プロジェクトごと)を返す。検索はクエリに応じて返せる。
function mockGet({
  search = () => page([]),
  projects = ok([alpha, beta]),
  members = { 1: ok([alice, bob]), 2: ok([alice, carol]) } as Record<number, unknown>,
}: {
  search?: (query: SearchQuery) => unknown;
  projects?: unknown;
  members?: Record<number, unknown>;
} = {}) {
  vi.mocked(api.GET).mockImplementation(((
    path: string,
    init?: { params?: { query?: SearchQuery; path?: { projectId?: number } } },
  ) => {
    if (path === "/api/tasks/search") return Promise.resolve(search(init!.params!.query!));
    if (path === "/api/projects") return Promise.resolve(projects);
    if (path === "/api/projects/{projectId}/members") return Promise.resolve(members[init!.params!.path!.projectId!]);
    return Promise.resolve(ok([]));
  }) as never);
}

function searchQueries(): SearchQuery[] {
  return vi
    .mocked(api.GET)
    .mock.calls.filter((call) => call[0] === "/api/tasks/search")
    .map((call) => (call[1] as { params: { query: SearchQuery } }).params.query);
}

function memberCalls(): number[] {
  return vi
    .mocked(api.GET)
    .mock.calls.filter((call) => call[0] === "/api/projects/{projectId}/members")
    .map((call) => (call[1] as { params: { path: { projectId: number } } }).params.path.projectId);
}

function renderApp(path = "/tasks") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rowTexts() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .slice(0, 4)
        .map((cell) => cell.textContent),
    );
}

function search(keyword: string) {
  fireEvent.change(screen.getByLabelText("キーワード"), { target: { value: keyword } });
  fireEvent.click(screen.getByRole("button", { name: "検索する" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStore.set({ token: "jwt", expiresAt: "2999-01-01T00:00:00Z", user });
});

describe("Task 検索", () => {
  it("ナビゲーションから検索画面へ移動できる", async () => {
    mockGet();
    renderApp("/");

    fireEvent.click(await screen.findByRole("link", { name: "Task 検索" }));

    expect(await screen.findByRole("heading", { name: "Task 検索", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Task 検索" })).toHaveAttribute("aria-current", "page");
  });

  it("条件なしで、所属するプロジェクトの Task を表示する(プロジェクト名・担当者名を含む)", async () => {
    mockGet({
      search: () =>
        page([
          task({ id: 1, title: "設計", projectId: 1, status: "in_progress", assigneeId: 2 }),
          task({ id: 2, title: "調査", projectId: 2, status: "done", assigneeId: 3 }),
          task({ id: 3, title: "実装", projectId: 1, assigneeId: null }),
        ]),
    });
    renderApp();

    await screen.findByRole("link", { name: "設計" });
    await waitFor(() =>
      expect(rowTexts()).toEqual([
        ["設計", "Alpha", "進行中", "Bob"],
        ["調査", "Beta", "完了", "Carol"],
        ["実装", "Alpha", "未着手", "未割り当て"],
      ]),
    );
    expect(searchQueries()[0]).toEqual({
      q: undefined,
      projectId: undefined,
      status: undefined,
      assigneeId: undefined,
      limit: 20,
      offset: 0,
    });
    // 担当者名のために、結果に含まれるプロジェクトのメンバー一覧だけを取得する
    expect([...new Set(memberCalls())].sort()).toEqual([1, 2]);
  });

  it("タイトルから Task 詳細へ移動できる", async () => {
    mockGet({ search: () => page([task({ id: 7, title: "設計" })]) });
    renderApp();

    expect(await screen.findByRole("link", { name: "設計" })).toHaveAttribute("href", "/tasks/7");
  });

  it("キーワードで検索する(前後の空白は除き、空なら指定しない)", async () => {
    mockGet({ search: (query) => page(query.q === "設計" ? [task({ title: "画面の設計" })] : []) });
    renderApp();
    await screen.findByText("条件に一致する Task はありません");

    search("  設計  ");
    expect(await screen.findByRole("link", { name: "画面の設計" })).toBeInTheDocument();
    expect(searchQueries().at(-1)).toMatchObject({ q: "設計", offset: 0 });

    search("   ");
    await waitFor(() => expect(searchQueries().at(-1)).toMatchObject({ q: undefined }));
  });

  it("キーワードは、文字を入力しただけでは検索しない", async () => {
    mockGet();
    renderApp();
    await screen.findByText("条件に一致する Task はありません");

    fireEvent.change(screen.getByLabelText("キーワード"), { target: { value: "設計" } });

    expect(searchQueries()).toHaveLength(1);
  });

  it("キーワードは 200 文字以内", async () => {
    mockGet();
    renderApp();

    expect(await screen.findByLabelText("キーワード")).toHaveAttribute("maxLength", "200");
  });

  it("プロジェクトの選択肢は所属するプロジェクトで、選ぶとそのプロジェクトで絞り込む", async () => {
    mockGet();
    renderApp();
    const select = screen.getByLabelText("プロジェクト");
    await within(select).findByRole("option", { name: "Beta" });

    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "すべて",
      "Alpha",
      "Beta",
    ]);
    fireEvent.change(select, { target: { value: "2" } });

    await waitFor(() => expect(searchQueries().at(-1)).toMatchObject({ projectId: 2, offset: 0 }));
  });

  it("ステータスで絞り込む", async () => {
    mockGet();
    renderApp();
    await screen.findByText("条件に一致する Task はありません");

    fireEvent.change(screen.getByLabelText("ステータス"), { target: { value: "done" } });

    await waitFor(() => expect(searchQueries().at(-1)).toMatchObject({ status: "done", offset: 0 }));
  });

  it("担当者は、プロジェクトを選ぶまで選べず、選ぶとそのメンバーが候補になる", async () => {
    mockGet();
    renderApp();
    const assignee = screen.getByLabelText("担当者");
    await screen.findByText("条件に一致する Task はありません");

    expect(assignee).toBeDisabled();
    expect(assignee).toHaveAccessibleDescription("プロジェクトを選ぶと、そのメンバーで絞り込めます");
    // プロジェクトを選んでいなければ、候補のためにメンバー一覧を取得しない
    expect(memberCalls()).toEqual([]);

    fireEvent.change(screen.getByLabelText("プロジェクト"), { target: { value: "2" } });
    await within(assignee).findByRole("option", { name: "Carol" });

    expect(assignee).toBeEnabled();
    expect(within(assignee).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "すべて",
      "Alice",
      "Carol",
    ]);
    fireEvent.change(assignee, { target: { value: "3" } });

    await waitFor(() => expect(searchQueries().at(-1)).toMatchObject({ projectId: 2, assigneeId: 3, offset: 0 }));
  });

  it("プロジェクトを変えたら、担当者の条件は外す", async () => {
    mockGet();
    renderApp();
    await within(screen.getByLabelText("プロジェクト")).findByRole("option", { name: "Alpha" });
    fireEvent.change(screen.getByLabelText("プロジェクト"), { target: { value: "1" } });
    await within(screen.getByLabelText("担当者")).findByRole("option", { name: "Bob" });
    fireEvent.change(screen.getByLabelText("担当者"), { target: { value: "2" } });

    fireEvent.change(screen.getByLabelText("プロジェクト"), { target: { value: "2" } });

    await waitFor(() => expect(searchQueries().at(-1)).toMatchObject({ projectId: 2, assigneeId: undefined }));
    expect(screen.getByLabelText("担当者")).toHaveValue("");
  });

  it("キーワード・プロジェクト・ステータス・担当者を組み合わせて検索する", async () => {
    mockGet();
    renderApp();
    await within(screen.getByLabelText("プロジェクト")).findByRole("option", { name: "Alpha" });

    fireEvent.change(screen.getByLabelText("プロジェクト"), { target: { value: "1" } });
    await within(screen.getByLabelText("担当者")).findByRole("option", { name: "Bob" });
    fireEvent.change(screen.getByLabelText("担当者"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("ステータス"), { target: { value: "todo" } });
    search("設計");

    await waitFor(() =>
      expect(searchQueries().at(-1)).toEqual({
        q: "設計",
        projectId: 1,
        status: "todo",
        assigneeId: 2,
        limit: 20,
        offset: 0,
      }),
    );
  });

  it("20 件ずつ表示し、条件を変えたら 1 ページ目に戻る", async () => {
    const all = Array.from({ length: 25 }, (_, i) => task({ id: i + 1, title: `Task ${i + 1}` }));
    mockGet({ search: (query) => page(all.slice(query.offset, query.offset + query.limit), all.length, query.offset) });
    renderApp();
    await screen.findByRole("link", { name: "Task 1" });
    expect(screen.getByText("全 25 件中 1〜20 件")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    expect(await screen.findByRole("link", { name: "Task 21" })).toBeInTheDocument();
    expect(screen.getByText("全 25 件中 21〜25 件")).toBeInTheDocument();

    search("Task");
    await waitFor(() => expect(searchQueries().at(-1)).toMatchObject({ q: "Task", offset: 0 }));
  });

  it("一致する Task が無ければ、その旨を表示する", async () => {
    mockGet();
    renderApp();

    expect(await screen.findByText("条件に一致する Task はありません")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("読み込み中は、その旨を表示する", async () => {
    mockGet({ search: () => new Promise(() => {}) });
    renderApp();

    expect(await screen.findByText("読み込み中...")).toHaveAttribute("aria-busy", "true");
  });

  it("入力値の検証エラー(422)は、詳細を添えて表示し、再読み込みできる", async () => {
    mockGet({ search: () => fail(422, "q is too long") });
    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("入力内容を確認してください(q is too long)");
    expect(screen.getByRole("button", { name: "再読み込み" })).toBeInTheDocument();
  });

  it("失敗したら(500)、エラーを表示し、再読み込みで取り直す", async () => {
    let failOnce = true;
    mockGet({
      search: () => {
        if (failOnce) {
          failOnce = false;
          return fail(500);
        }
        return page([task({ title: "設計" })]);
      },
    });
    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("エラーが発生しました");
    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));

    expect(await screen.findByRole("link", { name: "設計" })).toBeInTheDocument();
  });

  it("プロジェクト一覧を取得できなければ、その旨を表示し、プロジェクト名は ID で表示する", async () => {
    mockGet({ projects: fail(500), search: () => page([task({ title: "設計", projectId: 1 })]) });
    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent("プロジェクト一覧を取得できません");
    await screen.findByRole("link", { name: "設計" });
    expect(rowTexts()[0]?.[1]).toBe("プロジェクト #1");
  });

  it("メンバー一覧を取得できないプロジェクトの担当者は、ID で表示する", async () => {
    mockGet({ members: { 1: fail(500) }, search: () => page([task({ title: "設計", projectId: 1, assigneeId: 2 })]) });
    renderApp();
    await screen.findByRole("link", { name: "設計" });

    await waitFor(() => expect(rowTexts()[0]?.[3]).toBe("ユーザー #2"));
  });

  it("未ログインならログイン画面へ移動する", async () => {
    sessionStore.clear();
    renderApp();

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
    expect(api.GET).not.toHaveBeenCalled();
  });
});
