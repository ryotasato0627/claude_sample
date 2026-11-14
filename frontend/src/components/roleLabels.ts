import type { Role } from "../api/projects";

// ロールの表示名。一覧・詳細で共通に使う。
export const roleLabels: Record<Role, string> = {
  owner: "オーナー",
  member: "メンバー",
  viewer: "閲覧者",
};
