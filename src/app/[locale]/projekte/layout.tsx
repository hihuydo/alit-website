import { ProjekteList } from "@/components/ProjekteList";
import { getProjekte } from "@/lib/queries";

export default async function ProjekteLayout() {
  const projekte = await getProjekte();
  return <ProjekteList projekte={projekte} />;
}
