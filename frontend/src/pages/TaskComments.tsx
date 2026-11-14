import { type FormEvent, useState } from "react";

import { type Comment, useComments, useCreateComment, useDeleteComment, useUpdateComment } from "../api/comments";
import { errorMessage } from "../api/errors";
import type { Member } from "../api/members";
import type { Role } from "../api/projects";
import type { Task } from "../api/tasks";
import { can, canModifyComment } from "../auth/permissions";
import { useSession } from "../auth/session";
import { formatDateTime, memberName } from "../components/taskFormat";

const changeErrors = { 404: "コメントが見つかりません。既に削除された可能性があります" };

type TaskCommentsProps = {
  task: Task;
  // ロールが分かるまでは undefined(操作を表示しない)
  role: Role | undefined;
  members: Member[] | undefined;
};

// Task 詳細の「コメント」。一覧は全ロールに表示し、投稿は owner / member、
// 編集・削除は owner は全件・member は自分のコメントだけに表示する。
// UI の出し分けは UX のため。最終的な判定は Backend が行う。
export function TaskComments({ task, role, members }: TaskCommentsProps) {
  const comments = useComments(task.id);
  const session = useSession();
  const [editingId, setEditingId] = useState<number>();
  const create = useCreateComment(task.id, task.projectId);
  const update = useUpdateComment(task.id, task.projectId);
  const remove = useDeleteComment(task.id, task.projectId);

  // 投稿・編集・削除を並行させない。
  const busy = create.isPending || update.isPending || remove.isPending;
  const canPost = role !== undefined && can(role, "postComment");
  const canModify = (comment: Comment) =>
    role !== undefined && canModifyComment(role, comment.userId === session?.user.id);
  // 編集フォームを表示しているか。編集中のコメントが削除された(404 の後に取り直した)場合や、
  // 権限が無くなった場合はフォームが消えるため、編集のエラーは節の先頭に表示する。
  const editFormShown = comments.data?.some((comment) => comment.id === editingId && canModify(comment)) ?? false;

  // 直前の操作の結果だけを表示する。
  const resetResults = () => {
    create.reset();
    update.reset();
    remove.reset();
  };

  const startEditing = (comment: Comment) => {
    resetResults();
    setEditingId(comment.id);
  };

  const saveComment = (comment: Comment, body: string) => {
    update.mutate({ commentId: comment.id, body }, { onSuccess: () => setEditingId(undefined) });
  };

  const deleteComment = (comment: Comment) => {
    if (!window.confirm("このコメントを削除しますか?")) return;
    resetResults();
    setEditingId(undefined);
    remove.mutate(comment.id);
  };

  const postComment = (body: string, onPosted: () => void) => {
    resetResults();
    setEditingId(undefined);
    create.mutate(body, { onSuccess: onPosted });
  };

  return (
    <section>
      <h2>コメント</h2>
      {update.isSuccess && <p role="status">コメントを更新しました</p>}
      {remove.isSuccess && <p role="status">コメントを削除しました</p>}
      {remove.isError && <p role="alert">{errorMessage(remove.error, changeErrors)}</p>}
      {update.isError && !editFormShown && <p role="alert">{errorMessage(update.error, changeErrors)}</p>}
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
              {comments.data.map((comment) => {
                // 編集中に権限が無くなったら(403 の後にロールを取り直した場合など)、フォームを閉じる
                const editing = editingId === comment.id && canModify(comment);
                return (
                  <li key={comment.id}>
                    <article>
                      <header>
                        {/* 投稿者の名前はメンバー一覧から引く(外れたメンバーは ID で表示する) */}
                        <strong>{memberName(comment.userId, members)}</strong>{" "}
                        <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                        {comment.updatedAt !== comment.createdAt && <small>(編集済み)</small>}
                      </header>
                      {editing ? (
                        <EditCommentForm
                          comment={comment}
                          onSubmit={(body) => saveComment(comment, body)}
                          onCancel={() => setEditingId(undefined)}
                          pending={update.isPending}
                          error={update.isError ? errorMessage(update.error, changeErrors) : undefined}
                        />
                      ) : (
                        <>
                          {/* 本文は textarea で入力するため、改行をそのまま表示する */}
                          <p style={{ whiteSpace: "pre-line" }}>{comment.body}</p>
                          {canModify(comment) && (
                            <div role="group">
                              <button
                                type="button"
                                className="secondary"
                                aria-label={`${memberName(comment.userId, members)} のコメントを編集`}
                                onClick={() => startEditing(comment)}
                                disabled={busy}
                              >
                                編集する
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                aria-label={`${memberName(comment.userId, members)} のコメントを削除`}
                                onClick={() => deleteComment(comment)}
                                disabled={busy}
                              >
                                削除する
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {canPost && (
        <CreateCommentForm
          onSubmit={postComment}
          busy={busy}
          pending={create.isPending}
          posted={create.isSuccess}
          error={create.isError ? errorMessage(create.error) : undefined}
        />
      )}
    </section>
  );
}

type CreateCommentFormProps = {
  onSubmit: (body: string, onPosted: () => void) => void;
  busy: boolean;
  pending: boolean;
  posted: boolean;
  error: string | undefined;
};

function CreateCommentForm({ onSubmit, busy, pending, posted, error }: CreateCommentFormProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    onSubmit(String(new FormData(formElement).get("body")), () => formElement.reset());
  };

  return (
    // maxLength は UTF-16 のコード単位で数えるため、絵文字などを含むと Backend(文字数で数える)より少し厳しくなる
    <form onSubmit={submit} aria-label="コメントを投稿">
      <label>
        コメント
        <textarea name="body" required maxLength={5000} />
      </label>
      {posted && <p role="status">コメントを投稿しました</p>}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy} aria-busy={pending}>
        投稿する
      </button>
    </form>
  );
}

type EditCommentFormProps = {
  comment: Comment;
  onSubmit: (body: string) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | undefined;
};

function EditCommentForm({ comment, onSubmit, onCancel, pending, error }: EditCommentFormProps) {
  // フォームを開いた時点の本文。編集中に一覧を取り直しても、これと比べて変更の有無を決める。
  const [initialBody] = useState(comment.body);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = String(new FormData(event.currentTarget).get("body"));
    if (body === initialBody) {
      onCancel();
      return;
    }
    onSubmit(body);
  };

  return (
    <form onSubmit={submit} aria-label="コメントを編集">
      <label>
        本文
        <textarea name="body" required maxLength={5000} defaultValue={initialBody} />
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
