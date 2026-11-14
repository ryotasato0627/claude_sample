import { type FormEvent, type ReactNode, useState } from "react";
import { useNavigate } from "react-router";

import { ApiError, errorMessage } from "../api/errors";
import { type Member, useAddMember, useMembers, useRemoveMember, useUpdateMemberRole } from "../api/members";
import type { Project, Role } from "../api/projects";
import { can } from "../auth/permissions";
import { useSession } from "../auth/session";
import { roleLabels } from "../components/roleLabels";

const roles: readonly Role[] = ["owner", "member", "viewer"];

function toRole(value: FormDataEntryValue | null): Role | undefined {
  return roles.find((role) => role === value);
}

// 追加の 422 は、ほとんどが未登録のメールアドレス。その他の原因も分かるよう、Backend の詳細を添える。
function addInvalidMessage(error: unknown): string {
  const message = "登録済みのユーザーのメールアドレスを入力してください";
  return error instanceof ApiError && error.body ? `${message}(${error.body.message})` : message;
}

const changeErrors = {
  404: "メンバーが見つかりません。既に外されている可能性があります",
  409: "プロジェクトにはオーナーが 1 人以上必要です。最後のオーナーは変更・削除できません",
};

// プロジェクト詳細の「メンバー」。一覧は全ロールに表示し、追加・ロール変更・削除は owner にだけ表示する。
// UI の出し分けは UX のため。最終的な判定は Backend が行う。
export function ProjectMembers({ project }: { project: Project }) {
  const members = useMembers(project.id);
  const manage = can(project.role, "manageMembers");

  return (
    <section>
      <h2>メンバー</h2>
      {members.isPending ? (
        <p aria-busy="true">読み込み中...</p>
      ) : !members.data ? (
        <p role="alert">{errorMessage(members.error)}</p>
      ) : (
        <>
          {/* 取得済みの一覧がある場合は、再取得に失敗しても一覧を残し、エラーを併記する */}
          {members.isError && <p role="alert">{errorMessage(members.error)}</p>}
          {manage ? (
            <ManageMembers project={project} members={members.data} />
          ) : (
            <MemberTable members={members.data} />
          )}
        </>
      )}
    </section>
  );
}

function MemberTable({ members, renderActions }: { members: Member[]; renderActions?: (member: Member) => ReactNode }) {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">名前</th>
          <th scope="col">メールアドレス</th>
          <th scope="col">ロール</th>
          {renderActions && <th scope="col">操作</th>}
        </tr>
      </thead>
      <tbody>
        {members.map((member) => (
          <tr key={member.userId}>
            <td>{member.name}</td>
            <td>{member.email}</td>
            <td>{roleLabels[member.role]}</td>
            {renderActions && <td>{renderActions(member)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ManageMembers({ project, members }: { project: Project; members: Member[] }) {
  const session = useSession();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string>();
  const add = useAddMember(project.id);
  const update = useUpdateMemberRole(project.id);
  const remove = useRemoveMember(project.id, { onLeft: () => navigate("/projects", { replace: true }) });

  const busy = add.isPending || update.isPending || remove.isPending;
  // 直前の操作の結果だけを表示する。
  const resetResults = () => {
    setMessage(undefined);
    add.reset();
    update.reset();
    remove.reset();
  };

  const changeRole = (member: Member, role: Role) => {
    const isSelf = member.userId === session?.user.id;
    if (isSelf && role !== "owner" && !window.confirm("自分のロールを変更すると、メンバーの管理とプロジェクトの編集・削除ができなくなります。変更しますか?")) {
      return;
    }
    resetResults();
    update.mutate(
      { userId: member.userId, role },
      { onSuccess: () => setMessage(`${member.name} のロールを${roleLabels[role]}に変更しました`) },
    );
  };

  const removeMember = (member: Member) => {
    const isSelf = member.userId === session?.user.id;
    const question = isSelf
      ? `自分をプロジェクトから外しますか?「${project.name}」を表示できなくなります`
      : `${member.name} をプロジェクトから外しますか?担当している Task の担当は解除されます`;
    if (!window.confirm(question)) return;
    resetResults();
    remove.mutate(member.userId, { onSuccess: () => setMessage(`${member.name} をプロジェクトから外しました`) });
  };

  const addMember = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const role = toRole(form.get("role"));
    if (!role) return;
    resetResults();
    add.mutate(
      { email: String(form.get("email")), role },
      {
        onSuccess: (member) => {
          setMessage(`${member.name} を追加しました`);
          formElement.reset();
        },
      },
    );
  };

  const changeError = update.error ?? remove.error;

  return (
    <>
      {message && <p role="status">{message}</p>}
      {changeError && <p role="alert">{errorMessage(changeError, changeErrors)}</p>}
      <MemberTable
        members={members}
        renderActions={(member) => (
          <div role="group">
            <select
              aria-label={`${member.name} のロール`}
              value={member.role}
              onChange={(event) => {
                const role = toRole(event.target.value);
                if (role) changeRole(member, role);
              }}
              disabled={busy}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="secondary"
              aria-label={`${member.name} を外す`}
              onClick={() => removeMember(member)}
              disabled={busy}
            >
              外す
            </button>
          </div>
        )}
      />
      <h3>メンバーを追加</h3>
      <form onSubmit={addMember}>
        <label>
          メールアドレス
          <input name="email" type="email" required />
        </label>
        <label>
          ロール
          <select name="role" defaultValue="member">
            {roles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </label>
        {add.isError && (
          <p role="alert">
            {errorMessage(add.error, { 409: "既にメンバーです", 422: addInvalidMessage(add.error) })}
          </p>
        )}
        <button type="submit" disabled={busy} aria-busy={add.isPending}>
          追加する
        </button>
      </form>
    </>
  );
}
