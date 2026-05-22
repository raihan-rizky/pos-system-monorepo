import POSClientPage from "./POSClientPage";
import { loadPOSInitialData } from "./pos-initial-data";

export const dynamic = "force-dynamic";

export default async function POSPage() {
  const initialData = await loadPOSInitialData();

  return <POSClientPage initialData={initialData} />;
}
