import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { api } from "../api/client";
import type { Member } from "../api/members";
import type { Project, Role } from "../api/projects";
import { sessionStore } from "../auth/session";

vi.mock("../api/client", () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }));

// ログイン中のユーザー(userId: 1)
const user = { id: 1, email: "alice@example.com", name: "Alice", createdAt: "2026-01-01T00:00:00Z" };

const alice: Member = { userId: 1, email: "alice@example.com", name: "Alice", role: "owner" };
const bob: Member = { userId: 2, email: "bob@example.com", name: "Bob", role: "member" };
const carol: Member = { userId: 3, email: "carol@example.com", name: "Carol", role: "viewer" };

function project(role: Role): Project {
  return { id: 1, name: "Alpha", description: "", role, createdAt: "2026-01-01T00:00:00Z" };
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

// 詳細・メンバー一覧・プロジェクト一覧を、パスごとに返す。
function mockGet({
  detail = ok(project("owner")),
  members = ok([alice, bob, carol]),
  list = ok([]),
}: {
  detail?: unknown;
  members?: unknown;
  list?: unknown;
} = {}) {
  vi.mocked(api.GET).mockImplementation(((path: string) =>
    Promise.resolve(
      path === "/api/projects/{projectId}/members" ? members : path === "/api/projects" ? list : detail,
    )) as never);
}

function getCalls(path: string) {
  return vi.mocked(api.GET).mock.calls.filter((call) => call[0] === path);
}

async function membersSection() {
  return within((await screen.findByRole("heading", { name: "メンバー" })).closest("section")!);
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStore.set({ token: "jwt", expiresAt: "2999-01-01T00:00:00Z", user });
});

describe("メンバー一覧", () => {
  it.each(["owner", "member", "viewer"] as const)("%s にも、名前・メールアドレス・ロールを表示する", async (role) => {
    mockGet({ detail: ok(project(role)) });
    renderApp();
    const section = await membersSection();

    await section.findByRole("cell", { name: "Bob" });
    const rows = section.getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").slice(0, 3).map((cell) => cell.textContent))).toEqual([
      ["Alice", "alice@example.com", "オーナー"],
      ["Bob", "bob@example.com", "メンバー"],
      ["Carol", "carol@example.com", "閲覧者"],
    ]);
    expect(api.GET).toHaveBeenCalledWith("/api/projects/{projectId}/members", { params: { path: { projectId: 1 } } });
  });

  // 権限マトリクス: メンバー追加・ロール変更・削除は owner のみ
  it("owner には追加・ロール変更・削除を表示する", async () => {
    mockGet();
    renderApp();
    const section = await membersSection();

    expect(await section.findByRole("combobox", { name: "Bob のロール" })).toBeInTheDocument();
    expect(section.getByRole("button", { name: "Bob を外す" })).toBeInTheDocument();
    expect(section.getByRole("button", { name: "追加する" })).toBeInTheDocument();
  });

  it.each(["member", "viewer"] as const)("%s には追加・ロール変更・削除を表示しない", async (role) => {
    mockGet({ detail: ok(project(role)) });
    renderApp();
    const section = await membersSection();

    await section.findByRole("cell", { name: "Bob" });
    expect(section.queryByRole("combobox")).not.toBeInTheDocument();
    expect(section.queryByRole("button")).not.toBeInTheDocument();
    expect(section.queryByLabelText("メールアドレス")).not.toBeInTheDocument();
  });

  it("読み込み中は、その旨を表示する", async () => {
    mockGet({ members: new Promise(() => {}) });
    renderApp();
    const section = await membersSection();

    expect(section.getByText("読み込み中...")).toHaveAttribute("aria-busy", "true");
  });

  it("取得できなければ、エラーを表示する", async () => {
    mockGet({ members: fail(500) });
    renderApp();
    const section = await membersSection();

    expect(await section.findByRole("alert")).toHaveTextContent("エラーが発生しました");
    expect(section.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("メンバー追加", () => {
  function submitAdd(email: string, role: string) {
    fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: email } });
    fireEvent.change(screen.getByRole("combobox", { name: "ロール" }), { target: { value: role } });
    fireEvent.click(screen.getByRole("button", { name: "追加する" }));
  }

  it("メールアドレスとロールで追加し、一覧を取り直してフォームを空にする", async () => {
    const dave: Member = { userId: 4, email: "dave@example.com", name: "Dave", role: "viewer" };
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(ok(dave, 201));
    renderApp();
    await screen.findByRole("cell", { name: "Bob" });

    mockGet({ members: ok([alice, bob, carol, dave]) });
    submitAdd("dave@example.com", "viewer");

    expect(await screen.findByRole("status")).toHaveTextContent("Dave を追加しました");
    expect(api.POST).toHaveBeenCalledWith("/api/projects/{projectId}/members", {
      params: { path: { projectId: 1 } },
      body: { email: "dave@example.com", role: "viewer" },
    });
    expect(await screen.findByRole("cell", { name: "Dave" })).toBeInTheDocument();
    expect(screen.getByLabelText("メールアドレス")).toHaveValue("");
  });

  it("ロールの初期値はメンバー", async () => {
    mockGet();
    renderApp();

    expect(await screen.findByRole("combobox", { name: "ロール" })).toHaveValue("member");
  });

  it("未登録のメールアドレス(422)なら、その旨を表示し、入力を残す", async () => {
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(fail(422, "no registered user with that email"));
    renderApp();
    await screen.findByRole("cell", { name: "Bob" });

    submitAdd("nobody@example.com", "member");

    expect(await screen.findByRole("alert")).toHaveTextContent("登録済みのユーザーのメールアドレスを入力してください");
    expect(screen.getByLabelText("メールアドレス")).toHaveValue("nobody@example.com");
  });

  it("既にメンバー(409)なら、その旨を表示する", async () => {
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(fail(409));
    renderApp();
    await screen.findByRole("cell", { name: "Bob" });

    submitAdd("bob@example.com", "member");

    expect(await screen.findByRole("alert")).toHaveTextContent("既にメンバーです");
  });

  it("権限が無ければ(403)、その旨を表示し、詳細を取り直して現在のロールで表示する", async () => {
    mockGet();
    vi.mocked(api.POST).mockResolvedValue(fail(403));
    renderApp();
    await screen.findByRole("cell", { name: "Bob" });

    mockGet({ detail: ok(project("member")) });
    submitAdd("dave@example.com", "member");

    await waitFor(() => expect(screen.queryByRole("button", { name: "追加する" })).not.toBeInTheDocument());
    expect(screen.getByText("あなたのロール: メンバー")).toBeInTheDocument();
  });

  it("追加中はボタンを押せない(二重送信の防止)", async () => {
    mockGet();
    vi.mocked(api.POST).mockReturnValue(new Promise(() => {}) as never);
    renderApp();
    await screen.findByRole("cell", { name: "Bob" });

    submitAdd("dave@example.com", "member");

    expect(await screen.findByRole("button", { name: "追加する" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bob を外す" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Bob のロール" })).toBeDisabled();
  });
});

describe("ロール変更", () => {
  it("選んだロールに変更し、一覧を取り直す", async () => {
    mockGet();
    vi.mocked(api.PATCH).mockResolvedValue(ok({ ...bob, role: "viewer" }));
    renderApp();
    const select = await screen.findByRole("combobox", { name: "Bob のロール" });

    mockGet({ members: ok([alice, { ...bob, role: "viewer" }, carol]) });
    fireEvent.change(select, { target: { value: "viewer" } });

    expect(await screen.findByRole("status")).toHaveTextContent("Bob のロールを閲覧者に変更しました");
    expect(api.PATCH).toHaveBeenCalledWith("/api/projects/{projectId}/members/{userId}", {
      params: { path: { projectId: 1, userId: 2 } },
      body: { role: "viewer" },
    });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Bob のロール" })).toHaveValue("viewer"));
  });

  it("最後の owner を降格しようとした(409)なら、その旨を表示し、ロールを戻す", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet();
    vi.mocked(api.PATCH).mockResolvedValue(fail(409));
    renderApp();
    const select = await screen.findByRole("combobox", { name: "Alice のロール" });

    fireEvent.change(select, { target: { value: "member" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("最後のオーナーは変更・削除できません");
    expect(select).toHaveValue("owner");
  });

  it("自分を降格するときは確認し、取り消すと変更しない", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockGet();
    renderApp();

    fireEvent.change(await screen.findByRole("combobox", { name: "Alice のロール" }), { target: { value: "member" } });

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("メンバーを管理できなくなります"));
    expect(api.PATCH).not.toHaveBeenCalled();
  });

  it("自分を降格したら、詳細を取り直し、管理の操作を表示しない", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet({ members: ok([alice, { ...bob, role: "owner" }]) });
    vi.mocked(api.PATCH).mockResolvedValue(ok({ ...alice, role: "member" }));
    renderApp();
    const select = await screen.findByRole("combobox", { name: "Alice のロール" });

    mockGet({ detail: ok(project("member")), members: ok([{ ...alice, role: "member" }, { ...bob, role: "owner" }]) });
    fireEvent.change(select, { target: { value: "member" } });

    expect(await screen.findByText("あなたのロール: メンバー")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Alice のロール" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "編集する" })).not.toBeInTheDocument();
  });

  it("対象が既に外されていた(404)なら、その旨を表示し、一覧を取り直す", async () => {
    mockGet();
    vi.mocked(api.PATCH).mockResolvedValue(fail(404));
    renderApp();
    const select = await screen.findByRole("combobox", { name: "Bob のロール" });

    mockGet({ members: ok([alice, carol]) });
    fireEvent.change(select, { target: { value: "viewer" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("メンバーが見つかりません");
    await waitFor(() => expect(screen.queryByRole("cell", { name: "Bob" })).not.toBeInTheDocument());
  });
});

describe("メンバー削除", () => {
  it("確認後に外し、一覧を取り直す", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet();
    vi.mocked(api.DELETE).mockResolvedValue({ response: { ok: true, status: 204 } } as never);
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Bob を外す" }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("担当している Task の担当は解除されます"));
    mockGet({ members: ok([alice, carol]) });

    expect(await screen.findByRole("status")).toHaveTextContent("Bob をプロジェクトから外しました");
    expect(api.DELETE).toHaveBeenCalledWith("/api/projects/{projectId}/members/{userId}", {
      params: { path: { projectId: 1, userId: 2 } },
    });
    await waitFor(() => expect(screen.queryByRole("cell", { name: "Bob" })).not.toBeInTheDocument());
  });

  it("確認で取り消すと、外さない", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockGet();
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Bob を外す" }));

    expect(api.DELETE).not.toHaveBeenCalled();
  });

  it("最後の owner を外そうとした(409)なら、その旨を表示する", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet();
    vi.mocked(api.DELETE).mockResolvedValue(fail(409));
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Alice を外す" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("最後のオーナーは変更・削除できません");
    expect(screen.getByRole("cell", { name: "Alice" })).toBeInTheDocument();
  });

  it("自分を外したら、一覧へ移動し、詳細を取り直さない", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet({ members: ok([alice, { ...bob, role: "owner" }]) });
    vi.mocked(api.DELETE).mockResolvedValue({ response: { ok: true, status: 204 } } as never);
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Alice を外す" }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("「Alpha」を表示できなくなります"));
    expect(await screen.findByRole("heading", { name: "プロジェクト", level: 1 })).toBeInTheDocument();
    expect(getCalls("/api/projects/{projectId}")).toHaveLength(1);
  });

  it("権限が無ければ(403)、その旨を表示する", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet();
    vi.mocked(api.DELETE).mockResolvedValue(fail(403));
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Bob を外す" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("この操作を行う権限がありません");
  });
});
