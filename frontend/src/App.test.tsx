import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { api } from "./api/client";

vi.mock("./api/client", () => ({ api: { GET: vi.fn() } }));

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  beforeEach(() => vi.resetAllMocks());

  it("API の状態を表示する", async () => {
    vi.mocked(api.GET).mockResolvedValue({ data: { status: "ok" }, response: { status: 200 } } as never);
    renderApp();
    expect(await screen.findByText("API status: ok")).toBeInTheDocument();
  });

  it("接続できない場合はエラーを表示する", async () => {
    vi.mocked(api.GET).mockRejectedValue(new Error("network"));
    renderApp();
    expect(await screen.findByRole("alert")).toHaveTextContent("API に接続できません");
  });
});
