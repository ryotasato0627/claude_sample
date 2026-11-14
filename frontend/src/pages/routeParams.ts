// URL の ID は外部入力のため、正の整数(JS で正確に扱える範囲)だけを受け付ける。
export function parseId(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}
