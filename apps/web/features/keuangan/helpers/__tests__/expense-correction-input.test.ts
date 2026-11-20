import { describe, expect, it } from "vitest";
import { expenseCorrectionConfirmation, expenseCorrectionPreview } from "../expense-correction-input";

const request = {
  subject: { type: "BACKDATED_PURCHASE", id: "purchase-1" },
  operation: "cancel",
  draft: { reason: " Pembelian tercatat dua kali. " },
};
const confirmation = {
  ...request,
  version: "a".repeat(64),
  requestId: "686025aa-f6d8-409a-a240-44bdf606a5dc",
};

describe("input koreksi pengeluaran", () => {
  it("menormalkan alasan dan mempertahankan identitas pembayaran", () => {
    const input = expenseCorrectionPreview.parse({
      subject: {
        type: "BACKDATED_PURCHASE", id: "purchase-1",
        payment: { kind: "BACKDATED_PAYMENT", id: "payment-2" },
      },
      operation: "edit",
      draft: { reason: "  Salah tanggal  ", changes: { paidAt: "2026-11-20" } },
    });
    expect(input).toMatchObject({
      subject: { id: "purchase-1", payment: { id: "payment-2" } },
      draft: { reason: "Salah tanggal", dispositions: [] },
    });
  });

  it("menolak referensi pembayaran yang berbeda jenis dari pembelian", () => {
    expect(expenseCorrectionPreview.safeParse({
      ...request,
      subject: { ...request.subject, payment: { kind: "SUPPLIER_PAYABLE_PAYMENT", id: "payment-2" } },
    }).success).toBe(false);
  });

  it("menolak pengubahan tanpa data atau pembatalan yang menyertakan pengubahan", () => {
    expect(expenseCorrectionPreview.safeParse({ ...request, operation: "edit" }).success).toBe(false);
    expect(expenseCorrectionPreview.safeParse({
      ...request, draft: { ...request.draft, changes: { reference: "REF" } },
    }).success).toBe(false);
  });

  it("menolak penyelesaian dengan pecahan sen, tanpa referensi, atau tanpa pemasok", () => {
    for (const disposition of [
      { kind: "entryError", amountCents: 10.4, reference: "Koreksi ganda" },
      { kind: "refund", amountCents: 100, date: "2026-11-20", reference: " " },
      { kind: "credit", amountCents: 100, reference: "NK-1" },
    ]) {
      expect(expenseCorrectionPreview.safeParse({
        ...request, draft: { ...request.draft, dispositions: [{ ...disposition, paymentId: "payment-1" }] },
      }).success).toBe(false);
    }
  });

  it("mewajibkan versi pratinjau dan identitas permintaan saat konfirmasi", () => {
    expect(expenseCorrectionConfirmation.safeParse(request).success).toBe(false);
    expect(expenseCorrectionConfirmation.safeParse({ ...confirmation, version: "1" }).success).toBe(false);
    expect(expenseCorrectionConfirmation.parse(confirmation)).toMatchObject({
      version: confirmation.version, requestId: confirmation.requestId,
    });
  });
});
