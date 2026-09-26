import { useSession } from "../auth/session";

export function Home() {
  const session = useSession();
  return <h1>ようこそ、{session?.user.name} さん</h1>;
}
