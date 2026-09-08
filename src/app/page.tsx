import Workspace from "@/components/workspace";
import { localMode } from "@/server/config";
export const dynamic = "force-dynamic";
export default function Home() {
  return <Workspace localDemo={localMode()} />;
}
