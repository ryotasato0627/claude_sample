import { describe, expect, it } from "vitest";

import { ApiError, errorMessage, unwrap } from "./errors";

function result(status: number, body: { data?: unknown; error?: unknown } = {}) {
  return Promise.resolve({ ...body, response: new Response(null, { status }) });
}

describe("unwrap", () => {
  it("成功なら data を返す", async () => {
    await expect(unwrap(result(200, { data: { id: 1 } }))).resolves.toEqual({ id: 1 });
  });

  it("失敗なら、ステータスとエラー本文を持つ ApiError を投げる", async () => {
    const error = await unwrap(result(404, { error: { code: "not_found", message: "resource not found" } })).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, body: { code: "not_found", message: "resource not found" } });
  });

  it("エラー本文の形が不正なら、本文なしの ApiError を投げる", async () => {
    const error = await unwrap(result(502, { error: "Bad Gateway" })).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, body: undefined });
  });
});

describe("errorMessage", () => {
  const body = (message: string) => ({ code: "x", message });

  it.each([
    [422, body("email is invalid"), "入力内容を確認してください(email is invalid)"],
    [422, undefined, "入力内容を確認してください"],
    [409, body("conflict"), "既に存在するか、現在の状態と競合しています"],
    [403, body("forbidden"), "この操作を行う権限がありません"],
    [404, body("not found"), "見つかりません"],
    [401, body("unauthorized"), "ログインしてください"],
    [500, body("internal server error"), "エラーが発生しました。時間をおいて再度お試しください"],
    [502, undefined, "エラーが発生しました。時間をおいて再度お試しください"],
  ])("%i の文言を返す", (status, errorBody, expected) => {
    expect(errorMessage(new ApiError(status, errorBody))).toBe(expected);
  });

  it("画面ごとの文言を優先する", () => {
    expect(errorMessage(new ApiError(409, body("conflict")), { 409: "登録済みです" })).toBe("登録済みです");
  });

  it("ApiError 以外(通信の失敗など)は、接続できない旨を返す", () => {
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe(
      "サーバーに接続できません。時間をおいて再度お試しください",
    );
  });
});
