import { Link } from "react-router";

import type { Task } from "../api/tasks";
import { formatDateTime } from "./taskFormat";
import { taskStatusLabels } from "./taskStatusLabels";

type TaskTableProps = {
  tasks: Task[];
  // ページや条件を変えて読み込んでいる間(前の結果を表示している間)
  busy: boolean;
  assigneeName: (task: Task) => string;
  // 指定すると「プロジェクト」の列を表示する(Task 検索のように複数のプロジェクトの Task を並べる場合)
  projectName?: (task: Task) => string;
};

// Task の一覧表。プロジェクトの Task 一覧と Task 検索で使う。タイトルから Task 詳細へ移動する。
export function TaskTable({ tasks, busy, assigneeName, projectName }: TaskTableProps) {
  return (
    <table aria-busy={busy}>
      <thead>
        <tr>
          <th scope="col">タイトル</th>
          {projectName && <th scope="col">プロジェクト</th>}
          <th scope="col">ステータス</th>
          <th scope="col">担当者</th>
          <th scope="col">更新日時</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => (
          <tr key={task.id}>
            <td>
              <Link to={`/tasks/${task.id}`}>{task.title}</Link>
            </td>
            {projectName && <td>{projectName(task)}</td>}
            <td>{taskStatusLabels[task.status]}</td>
            <td>{assigneeName(task)}</td>
            <td>
              <time dateTime={task.updatedAt}>{formatDateTime(task.updatedAt)}</time>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
