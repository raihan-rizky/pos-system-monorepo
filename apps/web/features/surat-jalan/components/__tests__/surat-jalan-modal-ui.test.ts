import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(process.cwd(), "features/surat-jalan/components/SuratJalanCreateModal.tsx"),
  "utf8",
) + readFileSync(
  join(process.cwd(), "features/surat-jalan/components/SuratJalanHeader.tsx"),
  "utf8",
) + readFileSync(
  join(process.cwd(), "features/surat-jalan/components/SuratJalanForm.tsx"),
  "utf8",
);
const quantityTableSource = readFileSync(
  join(process.cwd(), "features/surat-jalan/components/SuratJalanQuantityTable.tsx"),
  "utf8",
);
const customerSelectSource = readFileSync(
  join(process.cwd(), "features/pos-checkout/components/CustomerCheckoutSelect.tsx"),
  "utf8",
);

describe("SuratJalanCreateModal UI contract", () => {
  it("uses the localized clickable invoice utama label", () => {
    expect(componentSource).toContain("Invoice Utama");
    expect(componentSource).not.toContain("Main Invoice");
    expect(componentSource).toContain("setInvoicePreviewOpen");
    expect(componentSource).toContain("aria-expanded={invoicePreviewOpen}");
  });

  it("uses restricted customer selection for penerima", () => {
    expect(componentSource).toContain("<CustomerCheckoutSelect");
    expect(componentSource).toContain('label="Penerima"');
    expect(componentSource).toContain("allowNewCustomer={false}");
    expect(customerSelectSource).toContain("allowNewCustomer = true");
  });

  it("keeps modal actions sticky", () => {
    expect(componentSource).toContain("sticky bottom-0");
    expect(componentSource).toContain("Konfirmasi Surat Jalan");
    expect(componentSource).toContain("Ya, Kurangi Stok");
  });

  it("shows remaining quantity over invoice quantity in the sisa column", () => {
    expect(quantityTableSource).toContain(
      "{item.remainingQuantity}/{item.invoiceQuantity}",
    );
  });
});
