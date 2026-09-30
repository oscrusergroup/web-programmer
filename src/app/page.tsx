import { backendProject } from "@/lib/server/backend";
import { Programmer } from "@/components/programmer";
export const dynamic = "force-dynamic";
export default async function Home() {
  const project = await backendProject();
  return <Programmer {...project} />;
}
