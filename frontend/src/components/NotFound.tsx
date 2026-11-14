import { Link } from "react-router";

// 見つからない(または表示する権限が無い)ときの表示。一覧へ戻るリンクを添える。
export function NotFound({ message }: { message: string }) {
  return (
    <>
      <p role="alert">{message}</p>
      <Link to="/projects">プロジェクト一覧へ戻る</Link>
    </>
  );
}
