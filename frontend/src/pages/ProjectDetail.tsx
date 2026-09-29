import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { ApiError, errorMessage } from "../api/errors";
import {
  type Project,
  type UpdateProjectRequest,
  useDeleteProject,
  useProject,
  useUpdateProject,
} from "../api/projects";
import { can } from "../auth/permissions";
import { roleLabels } from "../components/roleLabels";

const notFoundMessage = "プロジェクトが見つかりません";

// URL の projectId は外部入力のため、正の整数(JS で正確に扱える範囲)だけを受け付ける。
function parseProjectId(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

export function ProjectDetail() {
  const projectId = parseProjectId(useParams().projectId);
  if (projectId === undefined) return <NotFound message={notFoundMessage} />;
  // プロジェクトを移動したら、編集中の状態などを引き継がない。
  return <ProjectView key={projectId} projectId={projectId} />;
}

function NotFound({ message }: { message: string }) {
  return (
    <>
      <p role="alert">{message}</p>
      <Link to="/projects">プロジェクト一覧へ戻る</Link>
    </>
  );
}

function ProjectView({ projectId }: { projectId: number }) {
  const project = useProject(projectId);

  if (project.isPending) return <p aria-busy="true">読み込み中...</p>;
  // メンバーでないプロジェクトも 404 になる(存在を知らせない)。
  // 表示中に削除された・メンバーから外された場合も、古い内容と操作ボタンを残さない。
  const notFound = project.error instanceof ApiError && project.error.status === 404;
  if (!project.data || notFound) return <NotFound message={errorMessage(project.error, { 404: notFoundMessage })} />;

  return (
    <>
      <p>
        <Link to="/projects">プロジェクト一覧へ戻る</Link>
      </p>
      {project.isError && <p role="alert">{errorMessage(project.error, { 404: notFoundMessage })}</p>}
      <h1>{project.data.name}</h1>
      {/* 説明は textarea で入力するため、改行をそのまま表示する */}
      {project.data.description && <p style={{ whiteSpace: "pre-line" }}>{project.data.description}</p>}
      <p>あなたのロール: {roleLabels[project.data.role]}</p>
      {/* UI の出し分けは UX のため。最終的な判定は Backend が行う */}
      {can(project.data.role, "manageProject") && <ManageProject project={project.data} />}
    </>
  );
}

function ManageProject({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateProject(project.id);
  const remove = useDeleteProject(project.id);
  const navigate = useNavigate();

  const startEditing = () => {
    update.reset();
    setEditing(true);
  };

  const deleteProject = () => {
    if (!window.confirm(`「${project.name}」を削除しますか?Task とコメントもすべて削除されます`)) return;
    remove.mutate(undefined, {
      onSuccess: () => navigate("/projects", { replace: true, state: { deletedProjectName: project.name } }),
    });
  };

  const busy = update.isPending || remove.isPending;

  return (
    <section>
      <h2>プロジェクトの管理</h2>
      {editing ? (
        <EditProjectForm
          project={project}
          onSubmit={(body) => update.mutate(body, { onSuccess: () => setEditing(false) })}
          onCancel={() => setEditing(false)}
          pending={update.isPending}
          error={update.isError ? errorMessage(update.error, { 404: notFoundMessage }) : undefined}
        />
      ) : (
        <>
          {update.isSuccess && <p role="status">プロジェクトを更新しました</p>}
          {remove.isError && <p role="alert">{errorMessage(remove.error, { 404: notFoundMessage })}</p>}
          <div role="group">
            <button type="button" onClick={startEditing} disabled={busy}>
              編集する
            </button>
            <button
              type="button"
              className="secondary"
              onClick={deleteProject}
              disabled={busy}
              aria-busy={remove.isPending}
            >
              削除する
            </button>
          </div>
        </>
      )}
    </section>
  );
}

type EditProjectFormProps = {
  project: Project;
  onSubmit: (body: UpdateProjectRequest) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | undefined;
};

function EditProjectForm({ project, onSubmit, onCancel, pending, error }: EditProjectFormProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name"));
    const description = String(form.get("description"));
    // 変更した項目だけを送る(部分更新。他の人が同時に別の項目を更新しても消さない)。
    const body: UpdateProjectRequest = {};
    if (name !== project.name) body.name = name;
    if (description !== project.description) body.description = description;
    if (Object.keys(body).length === 0) {
      onCancel();
      return;
    }
    onSubmit(body);
  };

  return (
    // maxLength は UTF-16 のコード単位で数えるため、絵文字などを含むと Backend(文字数で数える)より少し厳しくなる
    <form onSubmit={submit}>
      <label>
        名前
        <input name="name" required maxLength={100} defaultValue={project.name} />
      </label>
      <label>
        説明
        <textarea name="description" maxLength={2000} defaultValue={project.description} />
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
