import type {
  AddGoodsPurchaseItemInput,
  CreateGoodsPurchaseInput,
  EditGoodsPurchaseItemInput,
  EligibleShoppingRequest,
  GoodsPurchaseDetail,
  GoodsPurchaseListParams,
  GoodsPurchaseListResponse,
  GoodsPurchaseMutationResult,
  LargeUnitProductOption,
} from "../types/goods-purchase";

const GOODS_PURCHASES_PATH = "/api/suppliers/goods-purchases";

export const goodsPurchasePaths = {
  list: GOODS_PURCHASES_PATH,
  eligible: `${GOODS_PURCHASES_PATH}/eligible-shopping-requests`,
  largeUnits: `${GOODS_PURCHASES_PATH}/large-unit-products`,
  detail: (id: string) => `${GOODS_PURCHASES_PATH}/${id}`,
  reject: (id: string) => `${GOODS_PURCHASES_PATH}/${id}/reject`,
  items: (id: string) => `${GOODS_PURCHASES_PATH}/${id}/items`,
  item: (id: string, itemId: string) =>
    `${GOODS_PURCHASES_PATH}/${id}/items/${itemId}`,
  itemApproval: (id: string, itemId: string) =>
    `${GOODS_PURCHASES_PATH}/${id}/items/${itemId}/approval`,
};

type DataResponse<T> = { data: T };

async function readResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | null;
  if (!response.ok) {
    throw new Error(
      payload?.message || "Permintaan Pembelian Barang gagal diproses",
    );
  }
  if (!payload) {
    throw new Error("Respons Pembelian Barang tidak valid");
  }
  return payload;
}

export async function listGoodsPurchases(
  params: GoodsPurchaseListParams = {},
): Promise<GoodsPurchaseListResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return readResponse(
    await fetch(`${goodsPurchasePaths.list}${query ? `?${query}` : ""}`),
  );
}

export async function getGoodsPurchase(
  id: string,
): Promise<DataResponse<GoodsPurchaseDetail>> {
  return readResponse(await fetch(goodsPurchasePaths.detail(id)));
}

export async function getEligibleShoppingRequests(
  q?: string,
): Promise<DataResponse<EligibleShoppingRequest[]>> {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return readResponse(
    await fetch(`${goodsPurchasePaths.eligible}${query}`),
  );
}

export async function getLargeUnitProducts(
  q?: string,
): Promise<DataResponse<LargeUnitProductOption[]>> {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return readResponse(
    await fetch(`${goodsPurchasePaths.largeUnits}${query}`),
  );
}

export async function createGoodsPurchase(
  input: CreateGoodsPurchaseInput,
): Promise<DataResponse<GoodsPurchaseDetail>> {
  return readResponse(
    await fetch(goodsPurchasePaths.list, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function approveGoodsPurchaseItem(
  id: string,
  itemId: string,
): Promise<GoodsPurchaseMutationResult> {
  return readResponse(
    await fetch(goodsPurchasePaths.itemApproval(id, itemId), {
      method: "POST",
    }),
  );
}

export async function editGoodsPurchaseItem(
  id: string,
  itemId: string,
  input: EditGoodsPurchaseItemInput,
): Promise<GoodsPurchaseMutationResult> {
  return readResponse(
    await fetch(goodsPurchasePaths.item(id, itemId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function removeGoodsPurchaseItem(
  id: string,
  itemId: string,
): Promise<GoodsPurchaseMutationResult> {
  return readResponse(
    await fetch(goodsPurchasePaths.item(id, itemId), {
      method: "DELETE",
    }),
  );
}

export async function addGoodsPurchaseItem(
  id: string,
  input: AddGoodsPurchaseItemInput,
): Promise<GoodsPurchaseMutationResult> {
  return readResponse(
    await fetch(goodsPurchasePaths.items(id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function rejectGoodsPurchase(
  id: string,
  reason: string,
): Promise<DataResponse<GoodsPurchaseDetail>> {
  return readResponse(
    await fetch(goodsPurchasePaths.reject(id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }),
  );
}
