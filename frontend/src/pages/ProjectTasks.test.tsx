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
