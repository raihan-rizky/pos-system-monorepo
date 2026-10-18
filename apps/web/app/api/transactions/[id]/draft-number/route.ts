import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { compactJakartaDateKey } from "@/features/invoice-date/helpers/invoice-date-core";
import { buildDraftNumber, nextDraftSequence, normalizeDraftNumberInput } from "@/features/transactions-draft/helpers/draft-number";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:transactions:draft-number");
export const dynamic = "force-dynamic";
const schema = z.object({ draftNumber: z.string().trim().min(1).max(100).transform(normalizeDraftNumberInput).nullable() });
type Context = { params: Promise<{ id: string }> };
type Draft = { id: string; draftNumber: string | null; invoiceDate: Date | null; createdAt: Date };

async function automaticNumber(draft: Draft, storeId: string) {
  if (draft.draftNumber && /^PNW-TLD-\d{8}-\d+$/.test(draft.draftNumber)) return draft.draftNumber;
  const date = compactJakartaDateKey(draft.invoiceDate ?? draft.createdAt);
  const siblings = await db.transaction.findMany({
    where: { storeId, id: { not: draft.id }, draftNumber: { startsWith: `PNW-TLD-${date}-` } },
    select: { draftNumber: true },
  });
  return buildDraftNumber(date, nextDraftSequence(siblings.map(row => row.draftNumber)));
}

async function loadDraft(id: string, storeId: string) {
  const draft = await db.transaction.findFirst({
    where: { id, storeId },
    select: { id: true, status: true, draftNumber: true, invoiceDate: true, createdAt: true },
  });
  if (!draft) return NextResponse.json({ message: "Transaksi tidak ditemukan." }, { status: 404 });
  if (draft.status !== "DRAFT") return NextResponse.json({ message: "Nomor hanya dapat diubah pada faktur sementara." }, { status: 409 });
  return draft;
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requirePermission("transaction.draft", "read");
    const storeId = user.storeId || "store-main";
    const draft = await loadDraft((await params).id, storeId);
    if (draft instanceof Response) return draft;
    return NextResponse.json({ draftNumber: draft.draftNumber, automaticNumber: await automaticNumber(draft, storeId) });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Failed to read draft number:", error);
    return NextResponse.json({ message: "Nomor faktur belum dapat dimuat." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requirePermission("transaction.draft", "update");
    const storeId = user.storeId || "store-main";
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: "Isi No. Faktur dengan 1–100 karakter, atau pilih Gunakan otomatis." }, { status: 422 });
    const draft = await loadDraft((await params).id, storeId);
    if (draft instanceof Response) return draft;
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = parsed.data.draftNumber ?? await automaticNumber(draft, storeId);
      if (number === draft.draftNumber) return NextResponse.json({ draftNumber: number });
      try {
        const result = await db.transaction.updateMany({
          where: { id: draft.id, storeId, status: "DRAFT", draftNumber: draft.draftNumber },
          data: { draftNumber: number },
        });
        if (result.count !== 1) return NextResponse.json({ message: "Faktur sudah berubah. Tutup dan buka kembali nota sebelum mencoba lagi." }, { status: 409 });
        return NextResponse.json({ draftNumber: number });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
        if (parsed.data.draftNumber !== null) return NextResponse.json({ message: "No. Faktur sudah digunakan. Silakan gunakan nomor lain." }, { status: 409 });
      }
    }
    return NextResponse.json({ message: "Nomor otomatis sedang digunakan. Silakan coba lagi." }, { status: 409 });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Failed to save draft number:", error);
    return NextResponse.json({ message: "Nomor faktur gagal disimpan. Silakan coba lagi." }, { status: 500 });
  }
}
