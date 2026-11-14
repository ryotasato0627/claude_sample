import { taskPageSize } from "../api/tasks";

// Task 一覧のページ送り(20 件ずつ)。プロジェクトの Task 一覧と Task 検索で使う。
type PaginationProps = {
  total: number;
  offset: number;
  count: number;
  disabled: boolean;
  onChange: (offset: number) => void;
};

export function Pagination({ total, offset, count, disabled, onChange }: PaginationProps) {
  if (total <= taskPageSize && offset === 0) return null;
  // 最後のページの先頭(表示中に件数が減って、範囲外のページにいる場合の戻り先)
  const lastOffset = Math.max(0, Math.floor((total - 1) / taskPageSize) * taskPageSize);
  return (
    <nav aria-label="ページ">
      <p>{count === 0 ? `全 ${total} 件` : `全 ${total} 件中 ${offset + 1}〜${offset + count} 件`}</p>
      <div role="group">
        <button
          type="button"
          className="secondary"
          onClick={() => onChange(Math.max(0, Math.min(offset - taskPageSize, lastOffset)))}
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
