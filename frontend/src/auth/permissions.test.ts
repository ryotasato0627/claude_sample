import { describe, expect, it } from "vitest";

import { type Action, can, canModifyComment } from "./permissions";

// docs/spec/requirements.md 第2章の権限マトリクスを書き写したもの(○ = true)。
const matrix: Record<Action, { owner: boolean; member: boolean; viewer: boolean }> = {
  viewProject: { owner: true, member: true, viewer: true },
  writeTask: { owner: true, member: true, viewer: false },
  changeTaskStatus: { owner: true, member: true, viewer: false },
  changeTaskAssignee: { owner: true, member: true, viewer: false },
  postComment: { owner: true, member: true, viewer: false },
  deleteTask: { owner: true, member: false, viewer: false },
  manageMembers: { owner: true, member: false, viewer: false },
  manageProject: { owner: true, member: false, viewer: false },
};

const cases = Object.entries(matrix).flatMap(([action, expected]) =>
  (["owner", "member", "viewer"] as const).map((role) => ({ action: action as Action, role, allowed: expected[role] })),
);

describe("can", () => {
  it.each(cases)("$role の $action は $allowed", ({ action, role, allowed }) => {
    expect(can(role, action)).toBe(allowed);
  });
});

describe("canModifyComment", () => {
  it.each([
    { role: "owner", own: true, allowed: true },
    { role: "owner", own: false, allowed: true }, // 全件
    { role: "member", own: true, allowed: true },
    { role: "member", own: false, allowed: false }, // 自分のみ
    { role: "viewer", own: true, allowed: false },
    { role: "viewer", own: false, allowed: false },
  ] as const)("$role(自分のコメント: $own)は $allowed", ({ role, own, allowed }) => {
    expect(canModifyComment(role, own)).toBe(allowed);
  });
});
