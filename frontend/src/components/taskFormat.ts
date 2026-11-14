import type { Member } from "../api/members";

const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" });

export function formatDateTime(value: string): string {
  return dateTimeFormat.format(new Date(value));
}

// ユーザーの名前をメンバー一覧から引く。
// メンバー一覧を取得できていない間や、取得後に外れたメンバーは ID で表示する。
export function memberName(userId: number, members: Member[] | undefined): string {
  return members?.find((member) => member.userId === userId)?.name ?? `ユーザー #${userId}`;
}

export function assigneeName(assigneeId: number | null, members: Member[] | undefined): string {
  return assigneeId === null ? "未割り当て" : memberName(assigneeId, members);
}
