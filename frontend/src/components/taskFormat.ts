import type { Member } from "../api/members";

const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" });

export function formatDateTime(value: string): string {
  return dateTimeFormat.format(new Date(value));
}

export function assigneeName(assigneeId: number | null, members: Member[] | undefined): string {
  if (assigneeId === null) return "未割り当て";
  // メンバー一覧を取得できていない間や、取得後に外れたメンバーは ID で表示する。
  return members?.find((member) => member.userId === assigneeId)?.name ?? `ユーザー #${assigneeId}`;
}
