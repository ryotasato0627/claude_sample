import type { components } from "../api/schema.gen";

type Role = components["schemas"]["Role"];

// 権限マトリクス(docs/spec/requirements.md 第2章)の操作。
// UI の出し分け(UX)のためのもので、最終的な判定は Backend が行う。
export type Action =
  | "viewProject" // プロジェクト閲覧・Task 検索
  | "writeTask" // Task 作成・編集
  | "changeTaskStatus" // ステータス変更
  | "changeTaskAssignee" // 担当者変更
  | "postComment" // コメント投稿
  | "deleteTask" // Task 削除
  | "manageMembers" // メンバー追加・ロール変更・削除
  | "manageProject"; // プロジェクト編集・削除

const allowedRoles: Record<Action, readonly Role[]> = {
  viewProject: ["owner", "member", "viewer"],
  writeTask: ["owner", "member"],
  changeTaskStatus: ["owner", "member"],
  changeTaskAssignee: ["owner", "member"],
  postComment: ["owner", "member"],
  deleteTask: ["owner"],
  manageMembers: ["owner"],
  manageProject: ["owner"],
};

export function can(role: Role, action: Action): boolean {
  return allowedRoles[action].includes(role);
}

// コメント編集・削除: owner は全件、member は自分のコメントのみ、viewer は不可。
export function canModifyComment(role: Role, isOwnComment: boolean): boolean {
  return role === "owner" || (role === "member" && isOwnComment);
}
