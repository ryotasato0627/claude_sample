import type { components } from "./schema.gen";

type ErrorBody = components["schemas"]["Error"];

export class ApiError extends Error {
  readonly status: number;
  readonly body: ErrorBody | undefined;

  constructor(status: number, body: ErrorBody | undefined) {
    super(body?.message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

function isErrorBody(value: unknown): value is ErrorBody {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

// openapi-fetch の結果を、成功なら data、失敗なら ApiError の throw に変換する(TanStack Query に渡すため)。
export async function unwrap<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) throw new ApiError(response.status, isErrorBody(error) ? error : undefined);
  return data as T;
}

// 画面に表示する文言。画面ごとの文言(overrides)を優先する。
// Backend のメッセージは英語のため、422 の詳細としてのみ添える。
export function errorMessage(error: unknown, overrides: Partial<Record<number, string>> = {}): string {
  if (!(error instanceof ApiError)) return "サーバーに接続できません。時間をおいて再度お試しください";
  const override = overrides[error.status];
  if (override) return override;
  switch (error.status) {
    case 422:
      return error.body ? `入力内容を確認してください(${error.body.message})` : "入力内容を確認してください";
    case 409:
      return "既に存在するか、現在の状態と競合しています";
    case 403:
      return "この操作を行う権限がありません";
    case 404:
      return "見つかりません";
    case 401:
      return "ログインしてください";
    default:
      return "エラーが発生しました。時間をおいて再度お試しください";
  }
}
