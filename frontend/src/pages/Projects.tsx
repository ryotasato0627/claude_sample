import type { FormEvent } from "react";

import { errorMessage } from "../api/errors";
import { type Role, useCreateProject, useProjects } from "../api/projects";

const roleLabels: Record<Role, string> = {
  owner: "オーナー",
  member: "メンバー",
  viewer: "閲覧者",
};

export function Projects() {
  return (
    <>
      <h1>プロジェクト</h1>
      <ProjectList />
      <CreateProjectForm />
    </>
  );
}

function ProjectList() {
  const projects = useProjects();

  if (projects.isPending) return <p aria-busy="true">読み込み中...</p>;
  // 取得済みの一覧がある場合は、再取得に失敗しても一覧を残し、エラーを併記する。
  if (!projects.data) return <p role="alert">{errorMessage(projects.error)}</p>;

  return (
    <>
      {projects.isError && <p role="alert">{errorMessage(projects.error)}</p>}
      {projects.data.length === 0 ? (
        <p>所属しているプロジェクトはまだありません</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">名前</th>
              <th scope="col">説明</th>
              <th scope="col">ロール</th>
            </tr>
          </thead>
          <tbody>
            {projects.data.map((project) => (
              <tr key={project.id}>
                <td>{project.name}</td>
                <td>{project.description}</td>
                <td>{roleLabels[project.role]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function CreateProjectForm() {
  const create = useCreateProject();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    create.mutate(
      { name: String(form.get("name")), description: String(form.get("description")) },
      { onSuccess: () => formElement.reset() },
    );
  };

  return (
    <section>
      <h2>プロジェクトを作成</h2>
      <form onSubmit={submit}>
        <label>
          名前
          <input name="name" required maxLength={100} />
        </label>
        <label>
          説明
          <textarea name="description" maxLength={2000} />
        </label>
        {create.isError && <p role="alert">{errorMessage(create.error)}</p>}
        {create.isSuccess && <p role="status">プロジェクトを作成しました</p>}
        <button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
          作成する
        </button>
      </form>
    </section>
  );
}
