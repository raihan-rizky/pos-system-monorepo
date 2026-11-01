import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
}));
vi.mock("@/features/keuangan/hooks/useKeuangan", () => ({
  useCustomExpenseCategories: () => ({ data: { data: [{ id: "kemasan", name: "Kemasan" }] }, isError: false }),
  expenseCategoriesQueryKey: (userId: string | null, storeId: string | null, fingerprint: string | null) => ["finance", "expense-categories", userId, storeId, fingerprint],
}));
vi.mock("@pos/ui", async (importOriginal) => ({
  ...await importOriginal<object>(),
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ExpenseFormModal } from "../ExpenseFormModal";

describe("kategori pengeluaran khusus", () => {
  it("menawarkan kategori tersimpan dan aksi membuat kategori kepada pengguna yang diizinkan", () => {
    const html = renderToStaticMarkup(<ExpenseFormModal open mode="create" onClose={vi.fn()} onSaved={vi.fn()} canCreateCategory />);
    expect(html).toContain("Kemasan");
    expect(html).toContain('value="custom:kemasan"');
    expect(html).toContain("Tambah kategori");
  });

  it("menyembunyikan aksi membuat kategori jika pengguna tidak memiliki izin", () => {
    const html = renderToStaticMarkup(<ExpenseFormModal open mode="edit" onClose={vi.fn()} onSaved={vi.fn()} canCreateCategory={false} />);
    expect(html).toContain("Kemasan");
    expect(html).not.toContain("Tambah kategori");
  });
});
