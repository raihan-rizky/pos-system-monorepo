import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExpenseFormModal } from "@/features/keuangan/components/ExpenseFormModal";
import TransactionBuktiModal from "@/features/transaction-history/components/TransactionBuktiModal";
import { WeeklyProofModal } from "@/features/inventory-management/components/WeeklyProofModal";
import { DamagedReportModal } from "@/features/inventory-management/components/DamagedReportModal";

vi.mock("@pos/ui", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Modal: ({ children, title }: any) => <div>{title}{children}</div>,
  };
});

vi.mock("../ProofImageUploader", () => ({
  ProofImageUploader: ({ context, onDelete }: { context: string; onDelete?: unknown }) => (
    <div data-proof-context={context} data-has-delete={Boolean(onDelete)}>R2 proof uploader</div>
  ),
}));

const summary = {
  period: { weekKey: "2026-W29" },
  counts: { weeklyProofMissing: true, damagedReportsPending: 0 },
} as any;

describe("R2 proof workflow integration", () => {
  it("uses the expense proof context", () => {
    const html = renderToStaticMarkup(
      <ExpenseFormModal open onClose={vi.fn()} onSaved={vi.fn()} mode="create" />,
    );
    expect(html).toContain('data-proof-context="expense"');
  });

  it("uses the transaction proof context", () => {
    const html = renderToStaticMarkup(
      <TransactionBuktiModal
        open
        onClose={vi.fn()}
        onSaved={vi.fn()}
        transactionId="tx-1"
        initialUrls={[]}
      />,
    );
    expect(html).toContain('data-proof-context="transaction"');
  });

  it("connects stored transaction and expense proofs to record-specific deletion", () => {
    const transaction = renderToStaticMarkup(
      <TransactionBuktiModal open onClose={vi.fn()} onSaved={vi.fn()} transactionId="tx-1" initialUrls={["https://prnt.sc/a"]} />,
    );
    const expense = renderToStaticMarkup(
      <ExpenseFormModal
        open onClose={vi.fn()} onSaved={vi.fn()} mode="edit"
        initial={{ id: "expense-1", applicantName: "Budi", category: "SUPPLIES", description: null, amount: 1, changeAmount: 0, occurredAt: "2026-07-18T00:00:00Z", transactionId: null, attachmentUrl: "https://prnt.sc/a" }}
      />,
    );
    expect(transaction).toContain('data-has-delete="true"');
    expect(expense).toContain('data-has-delete="true"');
  });

  it("uses the weekly-cleaning proof context", () => {
    const html = renderToStaticMarkup(
      <WeeklyProofModal
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialSummary={summary}
      />,
    );
    expect(html).toContain('data-proof-context="weekly-cleaning"');
    expect(html).toContain('data-has-delete="true"');
  });

  it("uses the damaged-product proof context", () => {
    const html = renderToStaticMarkup(
      <DamagedReportModal
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialSummary={summary}
      />,
    );
    expect(html).toContain('data-proof-context="damaged-product"');
  });
});
