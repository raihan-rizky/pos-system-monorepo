import POSClientPage from "./POSClientPage";
import { loadPOSInitialData } from "./pos-initial-data";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function POSPage() {
  const initialData = await loadPOSInitialData();
  const cookieStore = await cookies();
  const cashierId = cookieStore.get("x-pos-user-id")?.value;
  const storeId = cookieStore.get("x-pos-store-id")?.value || "store-main";

  return <>
    {cashierId && <div hidden data-offline-pos-cashier={cashierId} data-offline-pos-store={storeId} />}
    <POSClientPage initialData={initialData} />
  </>;
}
