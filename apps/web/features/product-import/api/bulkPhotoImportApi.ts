export interface SkuLookupResult {
  id: string;
  sku: string;
}

export async function lookupSkus(skus: string[]): Promise<Map<string, string>> {
  const res = await fetch("/api/products/by-sku", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skus }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error((payload as { message?: string }).message || "SKU lookup gagal");
  }
  const data: { results: SkuLookupResult[] } = await res.json();
  return new Map((data.results ?? []).map((r) => [r.sku.toLowerCase(), r.id]));
}

export async function uploadProductImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error((payload as { message?: string }).message || "Upload gagal");
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

export async function patchProductImage(productId: string, imageUrl: string): Promise<void> {
  const res = await fetch(`/api/products/${productId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error((payload as { message?: string }).message || "Simpan URL gagal");
  }
}
