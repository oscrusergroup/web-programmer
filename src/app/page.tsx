import { getProject } from "@/lib/server/project";
import { Programmer } from "@/components/programmer";
export const dynamic = "force-dynamic";
export default async function Home() {
  const project = await getProject();
  return <Programmer {...project} />;
}
