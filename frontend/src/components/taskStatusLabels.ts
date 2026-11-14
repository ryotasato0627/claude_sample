import type { TaskStatus } from "../api/tasks";

// Task のステータスの表示名。
export const taskStatusLabels: Record<TaskStatus, string> = {
  todo: "未着手",
  in_progress: "進行中",
  done: "完了",
};

// 選択肢の並び順。
export const taskStatuses: readonly TaskStatus[] = ["todo", "in_progress", "done"];
