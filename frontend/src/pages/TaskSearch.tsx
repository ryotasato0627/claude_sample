import { type FormEvent, useState } from "react";

import { errorMessage } from "../api/errors";
import { useMembersOf } from "../api/members";
import { useProjects } from "../api/projects";
import { type TaskSearchFilters, type TaskStatus, useSearchTasks } from "../api/tasks";
import { Pagination } from "../components/Pagination";
import { assigneeName } from "../components/taskFormat";
import { TaskTable } from "../components/TaskTable";
import { taskStatuses, taskStatusLabels } from "../components/taskStatusLabels";

function toStatus(value: string): TaskStatus | undefined {
  return taskStatuses.find((status) => status === value);
}

// select の値(空文字は「すべて」)を ID にする。
function toId(value: string): number | undefined {
  const id = Number(value);
  return value !== "" && Number.isSafeInteger(id) ? id : undefined;
}

// 自分が所属するプロジェクトの Task を、キーワード・プロジェクト・ステータス・担当者で検索する(全ロール)。
export function TaskSearch() {
  const [filters, setFilters] = useState<TaskSearchFilters>({ offset: 0 });
  const tasks = useSearchTasks(filters);
  const projects = useProjects();
  // 結果の担当者名は、結果に含まれる各プロジェクトのメンバー一覧から引く。
  // 担当者の候補は、選んだプロジェクトのメンバー(担当者になれるのはそのプロジェクトのメンバーのみ)。
  // プロジェクトを選んでいなければ、候補は取得しない。
  const resultProjectIds = tasks.data?.items.map((task) => task.projectId) ?? [];
  const membersByProject = useMembersOf(
    filters.projectId === undefined ? resultProjectIds : [...resultProjectIds, filters.projectId],
  );
  const selectedMembers = filters.projectId === undefined ? undefined : membersByProject.get(filters.projectId);

  // 条件を変えたら 1 ページ目に戻す。
  const changeFilter = (change: Omit<TaskSearchFilters, "offset">) => setFilters({ ...filters, ...change, offset: 0 });

  const submitKeyword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // 前後の空白だけの場合は、キーワードを指定しない
    const q = String(new FormData(event.currentTarget).get("q")).trim();
    changeFilter({ q: q === "" ? undefined : q });
  };

  const projectName = (projectId: number) =>
    projects.data?.find((project) => project.id === projectId)?.name ?? `プロジェクト #${projectId}`;

  return (
    <>
      <h1>Task 検索</h1>
      <form onSubmit={submitKeyword} role="search" aria-label="Task を検索">
        <label>
          キーワード
          {/* maxLength は UTF-16 のコード単位で数えるため、絵文字などを含むと Backend(文字数で数える)より少し厳しくなる */}
          <input name="q" type="search" maxLength={200} placeholder="タイトル・説明に含む文字" />
        </label>
        <button type="submit">検索する</button>
      </form>
      <div role="group" aria-label="絞り込み">
        <label>
          プロジェクト
          <select
            value={filters.projectId ?? ""}
            // プロジェクトを変えたら、担当者の条件は外す(候補がプロジェクトごとに違うため)
            onChange={(event) => changeFilter({ projectId: toId(event.target.value), assigneeId: undefined })}
          >
            <option value="">すべて</option>
            {projects.data?.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
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
            onChange={(event) => changeFilter({ assigneeId: toId(event.target.value) })}
            disabled={filters.projectId === undefined}
            aria-describedby="assignee-hint"
          >
            <option value="">すべて</option>
            {selectedMembers?.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
          </select>
        </label>
        {/* ラベルの外に置き、選択欄の説明として読み上げる(名前に含めない) */}
        <small id="assignee-hint">プロジェクトを選ぶと、そのメンバーで絞り込めます</small>
      </div>
      {projects.isError && <p role="alert">プロジェクト一覧を取得できません。{errorMessage(projects.error)}</p>}
      {tasks.isPending ? (
        <p aria-busy="true">読み込み中...</p>
      ) : !tasks.data ? (
        <>
          <p role="alert">{errorMessage(tasks.error)}</p>
          <button type="button" className="secondary" onClick={() => void tasks.refetch()}>
            再読み込み
          </button>
        </>
      ) : (
        <>
          {/* 取得済みの結果がある場合は、再取得に失敗しても結果を残し、エラーを併記する */}
          {tasks.isError && <p role="alert">{errorMessage(tasks.error)}</p>}
          {tasks.data.items.length === 0 ? (
            <p>{tasks.data.total > 0 ? "このページに Task はありません" : "条件に一致する Task はありません"}</p>
          ) : (
            <TaskTable
              tasks={tasks.data.items}
              busy={tasks.isPlaceholderData}
              projectName={(task) => projectName(task.projectId)}
              assigneeName={(task) => assigneeName(task.assigneeId, membersByProject.get(task.projectId))}
            />
          )}
          <Pagination
            total={tasks.data.total}
            // 表示中の結果(ページを移る間は前の結果)に合わせる
            offset={tasks.data.offset}
            count={tasks.data.items.length}
            disabled={tasks.isPlaceholderData}
            onChange={(offset) => setFilters({ ...filters, offset })}
          />
        </>
      )}
    </>
  );
}
