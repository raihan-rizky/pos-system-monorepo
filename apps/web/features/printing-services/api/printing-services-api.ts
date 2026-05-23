import type {
  PrintingService,
  PrintingServiceInput,
  PrintingServicesResponse,
} from "../types";

async function parseError(response: Response, fallback: string) {
  try {
    const body = await response.json();
    return body?.message || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchPrintingServices(params: {
  search?: string;
  page?: number;
  limit?: number;
  includeInactive?: boolean;
}): Promise<PrintingServicesResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(params.page ?? 1));
  searchParams.set("limit", String(params.limit ?? 50));
  if (params.search) searchParams.set("search", params.search);
  if (params.includeInactive) searchParams.set("includeInactive", "true");

  const response = await fetch(`/api/printing-services?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(await parseError(response, "Gagal memuat layanan cetak"));
  }
  return response.json();
}

export async function createPrintingService(
  input: PrintingServiceInput,
): Promise<PrintingService> {
  const response = await fetch("/api/printing-services", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Gagal membuat layanan cetak"));
  }
  return response.json();
}

export async function updatePrintingService(input: {
  id: string;
  data: Partial<PrintingServiceInput>;
}): Promise<PrintingService> {
  const response = await fetch(`/api/printing-services/${input.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.data),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Gagal mengubah layanan cetak"));
  }
  return response.json();
}

export async function deletePrintingService(id: string): Promise<void> {
  const response = await fetch(`/api/printing-services/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await parseError(response, "Gagal menghapus layanan cetak"));
  }
}

