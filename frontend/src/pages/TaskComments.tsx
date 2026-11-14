import { type FormEvent } from "react";

import { useComments, useCreateComment } from "../api/comments";
import { errorMessage } from "../api/errors";
import type { Member } from "../api/members";
import type { Role } from "../api/projects";
import type { Task } from "../api/tasks";
import { can } from "../auth/permissions";
import { formatDateTime, memberName } from "../components/taskFormat";

type TaskCommentsProps = {
  task: Task;
  // ロールが分かるまでは undefined(操作を表示しない)
  role: Role | undefined;
  members: Member[] | undefined;
};

// Task 詳細の「コメント」。一覧は全ロールに表示し、投稿は owner / member にだけ表示する。
// UI の出し分けは UX のため。最終的な判定は Backend が行う。
export function TaskComments({ task, role, members }: TaskCommentsProps) {
  const comments = useComments(task.id);

  return (
    <section>
      <h2>コメント</h2>
      {comments.isPending ? (
        <p aria-busy="true">読み込み中...</p>
      ) : !comments.data ? (
        <p role="alert">{errorMessage(comments.error)}</p>
      ) : (
        <>
          {/* 取得済みの一覧がある場合は、再取得に失敗しても一覧を残し、エラーを併記する */}
          {comments.isError && <p role="alert">{errorMessage(comments.error)}</p>}
          {comments.data.length === 0 ? (
            <p>コメントはまだありません</p>
          ) : (
            <ul aria-label="コメント一覧">
              {comments.data.map((comment) => (
                <li key={comment.id}>
                  <article>
                    <header>
                      {/* 投稿者の名前はメンバー一覧から引く(外れたメンバーは ID で表示する) */}
                      <strong>{memberName(comment.userId, members)}</strong>{" "}
                      <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                      {comment.updatedAt !== comment.createdAt && <small>(編集済み)</small>}
                    </header>
                    {/* 本文は textarea で入力するため、改行をそのまま表示する */}
                    <p style={{ whiteSpace: "pre-line" }}>{comment.body}</p>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {role !== undefined && can(role, "postComment") && <CreateCommentForm task={task} />}
    </section>
  );
}

function CreateCommentForm({ task }: { task: Task }) {
  const create = useCreateComment(task.id, task.projectId);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const body = String(new FormData(formElement).get("body"));
    create.mutate(body, { onSuccess: () => formElement.reset() });
  };

  return (
    // maxLength は UTF-16 のコード単位で数えるため、絵文字などを含むと Backend(文字数で数える)より少し厳しくなる
    <form onSubmit={submit} aria-label="コメントを投稿">
      <label>
        コメント
        <textarea name="body" required maxLength={5000} />
      </label>
      {create.isSuccess && <p role="status">コメントを投稿しました</p>}
      {create.isError && <p role="alert">{errorMessage(create.error)}</p>}
      <button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
        投稿する
      </button>
    </form>
  );
}
