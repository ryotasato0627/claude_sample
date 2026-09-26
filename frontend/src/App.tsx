import { useQuery } from "@tanstack/react-query";

import { api } from "./api/client";

export function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/health");
      return { status: data?.status ?? "unavailable", httpStatus: response.status };
    },
  });

  return (
    <main>
      <h1>Task Management</h1>
      {health.isPending && <p>Loading...</p>}
      {health.isError && <p role="alert">API に接続できません</p>}
      {health.data && <p>API status: {health.data.status}</p>}
    </main>
  );
}
