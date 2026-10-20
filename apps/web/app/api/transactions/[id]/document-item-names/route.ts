import { NextResponse } from "next/server";
import { db, type Prisma } from "@pos/db";
import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:transactions:document-item-names");
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    documentName: z.string().trim().min(1).max(300).nullable(),
    expectedDocumentName: z.string().min(1).max(300).nullable(),
  }).strict()).min(1),
}).strict().refine(({ items }) => new Set(items.map(item => item.id)).size === items.length);

const conflictMessage = "Item atau faktur sudah berubah. Tutup dan buka kembali nota sebelum mencoba lagi.";

class DocumentItemNamesError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function readDraft(client: Pick<Prisma.TransactionClient, "transaction">, id: string, storeId: string) {
  const draft = await client.transaction.findFirst({
    where: { id, storeId },
    select: {
      id: true,
      status: true,
      items: {
        orderBy: { id: "asc" },
        select: { id: true, productName: true, documentName: true },
      },
    },
  });
  if (!draft) throw new DocumentItemNamesError(404, "Transaksi tidak ditemukan.");
  if (draft.status !== "DRAFT") {
    throw new DocumentItemNamesError(409, "Nama dokumen hanya dapat diubah pada faktur sementara.");
  }
  return draft;
}

function errorResponse(error: unknown, message: string) {
  const authError = handleAuthError(error);
  if (authError) return authError;
  if (error instanceof DocumentItemNamesError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  const databaseError = error as { code?: string; meta?: { code?: string } } | null;
  if (databaseError?.code === "P2034" ||
      (databaseError?.code === "P2010" && ["40001", "40P01"].includes(databaseError.meta?.code ?? ""))) {
    return NextResponse.json({ message: conflictMessage }, { status: 409 });
  }
  log.error(message, error);
  return NextResponse.json({ message }, { status: 500 });
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requirePermission("transaction.draft", "read");
    const draft = await readDraft(db, (await params).id, user.storeId || "store-main");
    return NextResponse.json({ items: draft.items });
  } catch (error) {
    return errorResponse(error, "Nama item dokumen belum dapat dimuat.");
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requirePermission("transaction.draft", "update");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({
        message: "Isi nama dokumen dengan 1–300 karakter atau gunakan nama asli. Pastikan setiap item hanya dikirim satu kali.",
      }, { status: 422 });
    }
    const id = (await params).id;
    const storeId = user.storeId || "store-main";
    const items = await db.$transaction(async tx => {
      // Serialize against approvals and item edits that update the transaction.
      // The parameterized lock changes no transaction, product, or stock data.
      await tx.$queryRaw`
        SELECT "id" FROM "pos_transactions"
        WHERE "id" = ${id} AND "storeId" = ${storeId}
        FOR UPDATE
      `;
      const draft = await readDraft(tx, id, storeId);
      const changes = new Map(parsed.data.items.map(item => [item.id, item]));
      if (changes.size !== draft.items.length || draft.items.some(item => !changes.has(item.id))) {
        throw new DocumentItemNamesError(409, conflictMessage);
      }
      if (draft.items.some(item => changes.get(item.id)!.expectedDocumentName !== item.documentName)) {
        throw new DocumentItemNamesError(409, conflictMessage);
      }

      for (const item of draft.items) {
        const change = changes.get(item.id)!;
        const updated = await tx.transactionItem.updateMany({
          where: { id: item.id, transactionId: id, documentName: change.expectedDocumentName },
          data: { documentName: change.documentName },
        });
        if (updated.count !== 1) throw new DocumentItemNamesError(409, conflictMessage);
      }
      return draft.items.map(item => ({ ...item, documentName: changes.get(item.id)!.documentName }));
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error, "Nama item dokumen gagal disimpan. Silakan coba lagi.");
  }
}
