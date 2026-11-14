import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";

import { ApiError, errorMessage } from "../api/errors";
import { useMembers } from "../api/members";
import { useProject } from "../api/projects";
import {
  type Task,
  type UpdateTaskRequest,
  useTask,
  useUpdateTask,
  useUpdateTaskAssignee,
  useUpdateTaskStatus,
} from "../api/tasks";
import { can } from "../auth/permissions";
import { NotFound } from "../components/NotFound";
import { assigneeName, formatDateTime } from "../components/taskFormat";
import { taskStatuses, taskStatusLabels } from "../components/taskStatusLabels";
import { parseId } from "./routeParams";

const notFoundMessage = "Task が見つかりません";

export function TaskDetail() {
  const taskId = parseId(useParams().taskId);
  if (taskId === undefined) return <NotFound message={notFoundMessage} />;
  // Task を移動したら、編集中の状態などを引き継がない。
  return <TaskLoader key={taskId} taskId={taskId} />;
}

function TaskLoader({ taskId }: { taskId: number }) {
  const task = useTask(taskId);

  if (task.isPending) return <p aria-busy="true">読み込み中...</p>;
  // メンバーでないプロジェクトの Task も 404 になる(存在を知らせない)。
  // 表示中に削除された・メンバーから外された場合も、古い内容と操作を残さない。
  const notFound = task.error instanceof ApiError && task.error.status === 404;
  if (!task.data || notFound) return <NotFound message={errorMessage(task.error, { 404: notFoundMessage })} />;

  return (
    <>
      {task.isError && <p role="alert">{errorMessage(task.error, { 404: notFoundMessage })}</p>}
      <TaskView task={task.data} />
    </>
  );
}

function TaskView({ task }: { task: Task }) {
  // ロール(操作の出し分け)と担当者の名前は、Task が属するプロジェクトから取得する。
  const project = useProject(task.projectId);
  const members = useMembers(task.projectId);
  const [editing, setEditing] = useState(false);
  const update = useUpdateTask(task.id, task.projectId);
  const changeStatus = useUpdateTaskStatus(task.id, task.projectId);
  const changeAssignee = useUpdateTaskAssignee(task.id, task.projectId);

  // UI の出し分けは UX のため。最終的な判定は Backend が行う。ロールが分かるまでは操作を表示しない。
  const role = project.data?.role;
  const canWrite = role !== undefined && can(role, "writeTask");

  const canChangeStatus = role !== undefined && can(role, "changeTaskStatus");
  const canChangeAssignee = role !== undefined && can(role, "changeTaskAssignee");
  const changing = changeStatus.isPending || changeAssignee.isPending;

  // 直前の操作の結果だけを表示する。
  const resetResults = () => {
    update.reset();
    changeStatus.reset();
    changeAssignee.reset();
  };

  const startEditing = () => {
    resetResults();
    setEditing(true);
  };

  const selectStatus = (value: string) => {
    const status = taskStatuses.find((candidate) => candidate === value);
    if (!status) return;
    resetResults();
    changeStatus.mutate(status);
  };

  // 空文字は「未割り当て」。解除は null を明示して送る。
  const selectAssignee = (value: string) => {
    const assigneeId = value === "" ? null : Number(value);
    if (assigneeId !== null && !Number.isSafeInteger(assigneeId)) return;
    resetResults();
    changeAssignee.mutate(assigneeId);
  };

  // 現在の担当者がメンバー一覧に無い(取得中・外された)場合も、選択肢として残す。
  const assigneeMissing =
    task.assigneeId !== null && !members.data?.some((member) => member.userId === task.assigneeId);

  return (
    <>
      <p>
        <Link to={`/projects/${task.projectId}`}>
          {project.data ? `「${project.data.name}」へ戻る` : "プロジェクトへ戻る"}
        </Link>
      </p>
      {project.isError && <p role="alert">{errorMessage(project.error)}</p>}
      {/* 編集中に権限が無くなったら(403 の後にロールを取り直した場合など)、フォームを閉じる */}
      {editing && canWrite ? (
        <EditTaskForm
          task={task}
          onSubmit={(body) => update.mutate(body, { onSuccess: () => setEditing(false) })}
          onCancel={() => setEditing(false)}
          pending={update.isPending}
          error={update.isError ? errorMessage(update.error, { 404: notFoundMessage }) : undefined}
        />
      ) : (
        <>
          <h1>{task.title}</h1>
          {/* 説明は textarea で入力するため、改行をそのまま表示する */}
          {task.description && <p style={{ whiteSpace: "pre-line" }}>{task.description}</p>}
          {update.isSuccess && <p role="status">Task を更新しました</p>}
          {canWrite && (
            <button type="button" onClick={startEditing}>
              編集する
            </button>
          )}
        </>
      )}
      {changeStatus.isSuccess && <p role="status">ステータスを変更しました</p>}
      {changeAssignee.isSuccess && <p role="status">担当者を変更しました</p>}
      {changeStatus.isError && <p role="alert">{errorMessage(changeStatus.error, { 404: notFoundMessage })}</p>}
      {changeAssignee.isError && (
        <p role="alert">
          {errorMessage(changeAssignee.error, {
            404: notFoundMessage,
            422: "指定したユーザーは、このプロジェクトのメンバーではありません",
          })}
        </p>
      )}
      <dl>
        <dt>ステータス</dt>
        <dd>
          {canChangeStatus ? (
            <select
              aria-label="ステータス"
              value={task.status}
              onChange={(event) => selectStatus(event.target.value)}
              disabled={changing}
            >
              {taskStatuses.map((status) => (
                <option key={status} value={status}>
                  {taskStatusLabels[status]}
                </option>
              ))}
            </select>
          ) : (
            taskStatusLabels[task.status]
          )}
        </dd>
        <dt>担当者</dt>
        <dd>
          {canChangeAssignee ? (
            <select
              aria-label="担当者"
              value={task.assigneeId ?? ""}
              onChange={(event) => selectAssignee(event.target.value)}
              disabled={changing}
            >
              <option value="">未割り当て</option>
              {members.data?.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
              {assigneeMissing && (
                <option value={task.assigneeId ?? ""}>{assigneeName(task.assigneeId, undefined)}</option>
              )}
            </select>
          ) : (
            assigneeName(task.assigneeId, members.data)
          )}
        </dd>
        <dt>作成日時</dt>
        <dd>
          <time dateTime={task.createdAt}>{formatDateTime(task.createdAt)}</time>
        </dd>
        <dt>更新日時</dt>
        <dd>
          <time dateTime={task.updatedAt}>{formatDateTime(task.updatedAt)}</time>
        </dd>
      </dl>
    </>
  );
}

type EditTaskFormProps = {
  task: Task;
  onSubmit: (body: UpdateTaskRequest) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | undefined;
};

function EditTaskForm({ task, onSubmit, onCancel, pending, error }: EditTaskFormProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title"));
    const description = String(form.get("description"));
    // 変更した項目だけを送る(部分更新。他の人が同時に別の項目を更新しても消さない)。
    const body: UpdateTaskRequest = {};
    if (title !== task.title) body.title = title;
    if (description !== task.description) body.description = description;
    if (Object.keys(body).length === 0) {
      onCancel();
      return;
    }
    onSubmit(body);
  };

  return (
    // maxLength は UTF-16 のコード単位で数えるため、絵文字などを含むと Backend(文字数で数える)より少し厳しくなる
    <form onSubmit={submit} aria-label="Task を編集">
      <label>
        タイトル
        <input name="title" required maxLength={200} defaultValue={task.title} />
      </label>
      <label>
        説明
        <textarea name="description" maxLength={10000} defaultValue={task.description} />
      </label>
      {error && <p role="alert">{error}</p>}
      <div role="group">
        <button type="submit" disabled={pending} aria-busy={pending}>
          保存する
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={pending}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
