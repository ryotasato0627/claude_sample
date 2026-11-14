import { type FormEvent, useState } from "react";

import { errorMessage } from "../api/errors";
import { type Member, useMembers } from "../api/members";
import type { Project } from "../api/projects";
import { type TaskFilters, type TaskStatus, taskPageSize, useCreateTask, useProjectTasks } from "../api/tasks";
import { can } from "../auth/permissions";
import { taskStatuses, taskStatusLabels } from "../components/taskStatusLabels";

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" });

function toStatus(value: string): TaskStatus | undefined {
  return taskStatuses.find((status) => status === value);
}

// select の値(空文字は「すべて」)を担当者 ID にする。
function toAssigneeId(value: string): number | undefined {
  const id = Number(value);
  return value !== "" && Number.isSafeInteger(id) ? id : undefined;
}

function assigneeName(assigneeId: number | null, members: Member[] | undefined): string {
  if (assigneeId === null) return "未割り当て";
  // メンバー一覧を取得できていない間や、取得後に外れたメンバーは ID で表示する。
  return members?.find((member) => member.userId === assigneeId)?.name ?? `ユーザー #${assigneeId}`;
}

// プロジェクト詳細の「Task」。全ロールに一覧を表示し、作成は owner / member にだけ表示する。
// UI の出し分けは UX のため。最終的な判定は Backend が行う。
export function ProjectTasks({ project }: { project: Project }) {
  const [filters, setFilters] = useState<TaskFilters>({ offset: 0 });
  const tasks = useProjectTasks(project.id, filters);
  // 担当者の名前と絞り込みの選択肢に使う(メンバーの節と同じキャッシュ)。
  const members = useMembers(project.id);

  // 絞り込みを変えたら 1 ページ目に戻す。
  const changeFilter = (change: Omit<TaskFilters, "offset">) => setFilters({ ...filters, ...change, offset: 0 });
  const filtered = filters.status !== undefined || filters.assigneeId !== undefined;

  return (
    <section>
      <h2>Task</h2>
      <div role="group" aria-label="絞り込み">
        <label>
          ステータス
          <select
            value={filters.status ?? ""}
            onChange={(event) => changeFilter({ status: toStatus(event.target.value) })}
          >
            <option value="">すべて</option>
            {taskStatuses.map((status) => (
              <option key={status} value={status}>
                {taskStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          担当者
          <select
            value={filters.assigneeId ?? ""}
            onChange={(event) => changeFilter({ assigneeId: toAssigneeId(event.target.value) })}
          >
            <option value="">すべて</option>
            {members.data?.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tasks.isPending ? (
        <p aria-busy="true">読み込み中...</p>
      ) : !tasks.data ? (
        <p role="alert">{errorMessage(tasks.error)}</p>
      ) : (
        <>
          {/* 取得済みの一覧がある場合は、再取得に失敗しても一覧を残し、エラーを併記する */}
          {tasks.isError && <p role="alert">{errorMessage(tasks.error)}</p>}
          {tasks.data.items.length === 0 ? (
            <p>{filtered ? "条件に一致する Task はありません" : "Task はまだありません"}</p>
          ) : (
            <table aria-busy={tasks.isPlaceholderData}>
              <thead>
                <tr>
                  <th scope="col">タイトル</th>
                  <th scope="col">ステータス</th>
                  <th scope="col">担当者</th>
                  <th scope="col">更新日時</th>
                </tr>
              </thead>
              <tbody>
                {tasks.data.items.map((task) => (
                  <tr key={task.id}>
                    <td>{task.title}</td>
                    <td>{taskStatusLabels[task.status]}</td>
                    <td>{assigneeName(task.assigneeId, members.data)}</td>
                    <td>
                      <time dateTime={task.updatedAt}>{dateFormat.format(new Date(task.updatedAt))}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination
            total={tasks.data.total}
            offset={filters.offset}
            count={tasks.data.items.length}
            disabled={tasks.isPlaceholderData}
            onChange={(offset) => setFilters({ ...filters, offset })}
          />
        </>
      )}
      {/* 作成した Task が見えるよう、絞り込みを外して 1 ページ目に戻す */}
      {can(project.role, "writeTask") && (
        <CreateTaskForm projectId={project.id} onCreated={() => setFilters({ offset: 0 })} />
      )}
    </section>
  );
}

function CreateTaskForm({ projectId, onCreated }: { projectId: number; onCreated: () => void }) {
  const create = useCreateTask(projectId);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    create.mutate(
      { title: String(form.get("title")), description: String(form.get("description")) },
      {
        onSuccess: () => {
          formElement.reset();
          onCreated();
        },
      },
    );
  };

  return (
    // maxLength は UTF-16 のコード単位で数えるため、絵文字などを含むと Backend(文字数で数える)より少し厳しくなる
    <form onSubmit={submit} aria-labelledby="create-task-heading">
      <h3 id="create-task-heading">Task を作成</h3>
      <label>
        タイトル
        <input name="title" required maxLength={200} />
      </label>
      <label>
        説明
        <textarea name="description" maxLength={10000} />
      </label>
      {create.isSuccess && <p role="status">「{create.data.title}」を作成しました</p>}
      {create.isError && <p role="alert">{errorMessage(create.error)}</p>}
      <button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
        作成する
      </button>
    </form>
  );
}

type PaginationProps = {
  total: number;
  offset: number;
  count: number;
  disabled: boolean;
  onChange: (offset: number) => void;
};

function Pagination({ total, offset, count, disabled, onChange }: PaginationProps) {
  if (total <= taskPageSize && offset === 0) return null;
  return (
    <nav aria-label="ページ">
      <p>
        全 {total} 件中 {count === 0 ? 0 : offset + 1}〜{offset + count} 件
      </p>
      <div role="group">
        <button
          type="button"
          className="secondary"
          onClick={() => onChange(Math.max(0, offset - taskPageSize))}
          disabled={disabled || offset === 0}
        >
          前へ
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => onChange(offset + taskPageSize)}
          disabled={disabled || offset + taskPageSize >= total}
        >
          次へ
        </button>
      </div>
    </nav>
  );
}
