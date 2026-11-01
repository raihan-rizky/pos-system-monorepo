import React from "react";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { chromium } from "@playwright/test";

const state = vi.hoisted(() => ({
  loading: false,
  error: false,
  manualPayables: [] as { id: string; supplierName: string; amount: number; debtDate: string; dueDate: string | null; paid: number; payments: { id?: string; amount: number; paidAt: string }[] }[],
  items: [
    { goodsPurchaseId: "g1", number: "PB-001", supplierName: "Toko Satu", amount: 100000, debtDate: "2026-10-01", dueDate: "2026-11-05", payableId: null, status: "UNKNOWN", paid: null, remaining: null, payments: [] },
    { goodsPurchaseId: "g2", number: "PB-002", supplierName: "Toko Dua", amount: 100000, debtDate: "2026-10-01", dueDate: "2026-11-05", payableId: "d2", status: "UNPAID", paid: 0, remaining: 100000, payments: [] },
    { goodsPurchaseId: "g3", number: "PB-003", supplierName: "Toko Tiga", amount: 100000, debtDate: "2026-10-01", dueDate: "2026-11-05", payableId: "d3", status: "PARTIAL", paid: 30000, remaining: 70000, payments: [{ amount: 30000, paidAt: "2026-10-12" }] },
    { goodsPurchaseId: "g4", number: "PB-004", supplierName: "Toko Empat", amount: 100000, debtDate: "2026-10-01", dueDate: "2026-11-05", payableId: "d4", status: "PAID", paid: 100000, remaining: 0, payments: [] },
    { goodsPurchaseId: "g5", number: "PB-005", supplierName: "Toko Lima", amount: 100000, debtDate: null, dueDate: "2026-11-05", payableId: "d5", status: "UNKNOWN", paid: null, remaining: null, payments: [], historyIssue: true },
  ],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => queryKey[1] === "giro"
    ? { data: { items: state.items, manualPayables: state.manualPayables }, isLoading: state.loading, isError: state.error, refetch: vi.fn() }
    : { data: { items: [], page: 1, total: 0 }, isLoading: false, isError: false },
}));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ storeId: "store-1", userId: "user-1" }) }));

import { SupplierPayablesPanel } from "../SupplierPayablesPanel";
import { GiroAction, GiroPaymentFields, GiroReviewFields, saveGiro } from "../GiroPanel";
import * as giroComponents from "../GiroPanel";
import { parseGiroLinkManual, planGiroLink as planStoredGiroLink } from "../../helpers/giro-link-manual";

function storage() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
}
const scope = { storeId: "store-1", userId: "user-1", payableId: "d3" };
const lock = async (_name: string, work: () => Promise<void>) => work();

describe("panel giro di Keuangan", () => {
  it("menampilkan semua status, jatuh tempo, sisa, dan aksi yang sesuai", () => {
    const html = renderToStaticMarkup(<SupplierPayablesPanel canCreate canUpdate />);
    expect(html).toContain("PB-001");
    expect(html).toContain("PB-003");
    expect(html).toContain("Belum diketahui");
    expect(html).toContain("Belum lunas");
    expect(html).toContain("Sebagian");
    expect(html).toContain("Lunas");
    expect(html).toContain("2026-11-05");
    expect(html).toContain("70.000");
    expect(html).toContain("Periksa riwayat");
    expect(html).toContain("Catat pembayaran");
  });

  it("tidak menampilkan aksi giro tanpa izin memperbarui pengeluaran", () => {
    const html = renderToStaticMarkup(<SupplierPayablesPanel canCreate={false} canUpdate={false} />);
    expect(html).toContain("Belum diketahui");
    expect(html).not.toContain(">Periksa riwayat</button>");
    expect(html).not.toContain(">Catat pembayaran</button>");
  });

  it("menampilkan pembayaran yang sudah ada pada hutang terpilih dan meminta konfirmasi riwayat lengkap", () => {
    const html = renderToStaticMarkup(<GiroReviewFields item={state.items[0] as never} manualPayables={[{ id: "manual-1", supplierName: "Toko Satu", amount: 100000, paid: 20000, debtDate: "2026-10-01", dueDate: "2026-11-05", payments: [{ amount: 20000, paidAt: "2026-10-03" }] }]} selectedPayableId="manual-1" onSelectPayable={() => {}} payments={[{ amount: "30000", paidAt: "2026-10-12" }]} onPaymentsChange={() => {}} historyComplete={false} onHistoryCompleteChange={() => {}} />);
    expect(html).toContain("Hutang yang sudah dicatat");
    expect(html).toContain("2026-10-03");
    expect(html).toContain("20.000");
    expect(html).toContain("Pembayaran tambahan");
    expect(html).toContain("Saya memastikan riwayat pembayaran sudah lengkap");
    expect(html).toMatch(/type="checkbox"[^>]*required/);
  });

  it("memakai tanggal hutang manual terpilih sebagai batas pembayaran jika lebih awal dari penerimaan", () => {
    const html = renderToStaticMarkup(<GiroReviewFields item={state.items[0] as never} manualPayables={[{ id: "manual-1", supplierName: "Toko Satu", amount: 100000, paid: 0, debtDate: "2026-09-15", dueDate: "2026-11-05", payments: [] }]} selectedPayableId="manual-1" onSelectPayable={() => {}} payments={[{ amount: "30000", paidAt: "2026-09-20" }]} onPaymentsChange={() => {}} historyComplete={false} onHistoryCompleteChange={() => {}} />);
    expect(html).toMatch(/min="2026-09-15"/);
  });

  it("memakai tanggal hutang terhubung sebagai batas pembayaran berikutnya", () => {
    const item = { ...state.items[2], payableDebtDate: "2026-09-15" };
    const html = renderToStaticMarkup(<GiroPaymentFields item={item as never} amount="" onAmountChange={() => {}} paidAt="2026-10-20" onPaidAtChange={() => {}} />);
    expect(html).toMatch(/min="2026-09-15"/);
  });

  it("membatasi pembayaran giro pada sisa hutang dan tanggal yang valid", () => {
    const html = renderToStaticMarkup(<GiroPaymentFields item={state.items[2] as never} amount="" onAmountChange={() => {}} paidAt="2026-10-20" onPaidAtChange={() => {}} />);
    expect(html).toContain("70.000");
    expect(html).toMatch(/max="70000"/);
    expect(html).toMatch(/min="2026-10-01"/);
    expect(html).toContain("Tanggal pembayaran");
  });

  it("menampilkan aksi memastikan pembayaran yang tertunda bahkan saat giro lunas", () => {
    const html = renderToStaticMarkup(<GiroAction item={state.items[3] as never} canUpdate pending onReview={() => {}} onPay={() => {}} />);
    expect(html).toContain("Pastikan pembayaran");
  });

  it("menawarkan penautan hutang manual pada giro terverifikasi, termasuk yang lunas", () => {
    const props = { canUpdate: true, pending: false, hasManualPayables: true, onReview: () => {}, onPay: () => {}, onLink: () => {} };
    const partial = renderToStaticMarkup(<GiroAction {...props} item={state.items[2] as never} />);
    const paid = renderToStaticMarkup(<GiroAction {...props} item={state.items[3] as never} />);
    expect(partial).toContain("Catat pembayaran");
    expect(partial).toContain("Hubungkan hutang manual");
    expect(paid).toContain("Hubungkan hutang manual");
  });

  it("tetap menawarkan penautan dan pembayaran setelah penautan sebelumnya", () => {
    const props = { canUpdate: true, pending: false, hasManualPayables: true, onReview: () => {}, onPay: () => {}, onLink: () => {} };
    const partial = renderToStaticMarkup(<GiroAction {...props} item={{ ...state.items[2], hasManualLink: true } as never} />);
    const paid = renderToStaticMarkup(<GiroAction {...props} item={{ ...state.items[3], hasManualLink: true } as never} />);
    expect(partial).toContain("Catat pembayaran");
    expect(partial).toContain("Hubungkan hutang manual");
    expect(paid).toContain("Hubungkan hutang manual");
  });

  it("menyediakan penautan di panel saat ada hutang manual yang dapat diperiksa", () => {
    state.manualPayables = [{ id: "manual-1", supplierName: "Toko Satu", amount: 100000, debtDate: "2026-10-01", dueDate: null, paid: 0, payments: [] }];
    try {
      const html = renderToStaticMarkup(<SupplierPayablesPanel canCreate canUpdate />);
      expect(html).toContain("Hubungkan hutang manual");
    } finally { state.manualPayables = []; }
  });

  it("meminta pilihan eksplisit untuk pembayaran yang cocok dan menghitung saldo sesuai pilihan", () => {
    expect(giroComponents).toHaveProperty("planGiroLink");
    const plan = (giroComponents as unknown as { planGiroLink: (g: unknown, m: unknown, choices: Record<string, string>) => { valid: boolean; duplicatePayments: unknown[]; requiresDistinctConfirmation: boolean; paid: number; remaining: number } }).planGiroLink;
    const giro = { ...state.items[2], paid: 20000, remaining: 80000, payments: [{ id: "giro-pay", amount: 20000, paidAt: "2026-10-03" }] };
    const manual = { id: "manual-1", supplierName: "Toko Satu", amount: 100000, debtDate: "2026-10-01", dueDate: null, payments: [{ id: "manual-same", amount: 20000, paidAt: "2026-10-03" }, { id: "manual-other", amount: 30000, paidAt: "2026-10-04" }] };
    expect(plan(giro, manual, {}).valid).toBe(false);
    expect(plan(giro, manual, { "manual-same": "giro-pay" })).toMatchObject({ valid: true, duplicatePayments: [{ giroPaymentId: "giro-pay", manualPaymentId: "manual-same" }], requiresDistinctConfirmation: false, paid: 50000, remaining: 50000 });
    expect(plan(giro, manual, { "manual-same": "different" })).toMatchObject({ valid: true, duplicatePayments: [], requiresDistinctConfirmation: true, paid: 70000, remaining: 30000 });
  });

  it("menolak pilihan duplikat berulang, nominal berbeda, dan pembayaran gabungan melebihi hutang", () => {
    expect(giroComponents).toHaveProperty("planGiroLink");
    const plan = (giroComponents as unknown as { planGiroLink: (g: unknown, m: unknown, choices: Record<string, string>) => { valid: boolean } }).planGiroLink;
    const giro = { ...state.items[2], payments: [{ id: "giro-pay", amount: 30000, paidAt: "2026-10-03" }] };
    const manual = { id: "manual-1", amount: 100000, debtDate: "2026-10-01", payments: [{ id: "m1", amount: 30000, paidAt: "2026-10-03" }, { id: "m2", amount: 30000, paidAt: "2026-10-03" }] };
    expect(plan(giro, manual, { m1: "giro-pay", m2: "giro-pay" }).valid).toBe(false);
    expect(plan(giro, { ...manual, amount: 120000 }, { m1: "different", m2: "different" }).valid).toBe(false);
    expect(plan(giro, { ...manual, payments: [{ id: "m3", amount: 80000, paidAt: "2026-10-04" }] }, {}).valid).toBe(false);
  });

  it("meminta konfirmasi transaksi berbeda walau pembayaran giro yang cocok sudah dipasangkan", () => {
    const giro = { ...state.items[2], payments: [{ id: "giro-pay", amount: 30000, paidAt: "2026-10-03" }] };
    const manual = { id: "manual-1", amount: 100000, debtDate: "2026-10-01", payments: [{ id: "m1", amount: 30000, paidAt: "2026-10-03" }, { id: "m2", amount: 30000, paidAt: "2026-10-03" }] };
    expect(giroComponents.planGiroLink(giro, manual, { m1: "giro-pay", m2: "different" })).toMatchObject({ valid: true, requiresDistinctConfirmation: true, paid: 60000 });
  });

  it("menolak pembayaran sebelum tanggal masing-masing hutang", () => {
    const giro = { ...state.items[2], debtDate: "2026-10-10", payments: [{ id: "giro-pay", amount: 30000, paidAt: "2026-10-05" }] };
    const manual = { id: "manual-1", amount: 100000, debtDate: "2026-10-01", payments: [] };
    expect(giroComponents.planGiroLink(giro, manual, {}).valid).toBe(false);
    expect(giroComponents.planGiroLink({ ...giro, debtDate: "2026-10-01", payments: [] }, { ...manual, debtDate: "2026-10-10", payments: [{ id: "manual-pay", amount: 30000, paidAt: "2026-10-05" }] }, {}).valid).toBe(false);
  });

  it("menampilkan kedua riwayat dan meminta keputusan untuk pasangan pembayaran yang cocok", () => {
    expect(giroComponents).toHaveProperty("GiroLinkFields");
    const Fields = (giroComponents as unknown as { GiroLinkFields: React.ComponentType<Record<string, unknown>> }).GiroLinkFields;
    const item = { ...state.items[2], payableNote: "Catatan giro terdahulu", payments: [{ id: "giro-pay", amount: 30000, paidAt: "2026-10-03" }] };
    const manual = { id: "manual-1", supplierName: "Toko Satu", amount: 100000, paid: 30000, debtDate: "2026-10-01", dueDate: "2026-11-05", note: "Rincian hutang manual", payments: [{ id: "manual-pay", amount: 30000, paidAt: "2026-10-03" }] };
    const html = renderToStaticMarkup(<Fields item={item} manualPayables={[manual]} selectedPayableId="manual-1" onSelectPayable={() => {}} choices={{}} onChoicesChange={() => {}} historiesConfirmed={false} onHistoriesConfirmedChange={() => {}} distinctConfirmed={false} onDistinctConfirmedChange={() => {}} />);
    expect(html).toContain("Riwayat pembayaran giro");
    expect(html).toContain("Riwayat pembayaran hutang manual");
    expect(html).toContain("Catatan giro terdahulu");
    expect(html).toContain("Rincian hutang manual");
    expect(html).toContain("2026-10-03");
    expect(html).toContain("30.000");
    expect(html).toContain("Pembayaran yang sama");
    expect(html).toContain("Pembayaran berbeda");
    expect(html).toContain("pengeluaran manual");
  });

  it("mengirim snapshot kedua hutang dan hanya pasangan duplikat pilihan pengguna", async () => {
    expect(giroComponents).toHaveProperty("postGiroLink");
    const post = (giroComponents as unknown as { postGiroLink: (g: unknown, m: unknown, choices: Record<string, string>, confirmed: boolean, distinct: boolean, fetcher: typeof fetch) => Promise<void> }).postGiroLink;
    const item = { ...state.items[2], payableDebtDate: "2026-10-01", payableNote: "Catatan giro terdahulu", payments: [{ id: "giro-pay", amount: 30000, paidAt: "2026-10-03" }] };
    const manual = { id: "manual-1", supplierName: "Toko Satu", amount: 100000, debtDate: "2026-09-30", dueDate: null, note: "Rincian hutang manual", payments: [{ id: "manual-pay", amount: 30000, paidAt: "2026-10-03" }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ payableId: "d3" }), { status: 200 }));
    await expect(post(item, manual, {}, true, false, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await post(item, manual, { "manual-pay": "giro-pay" }, true, false, fetcher);
    expect(fetcher).toHaveBeenCalledWith("/api/finance/giro/g3/link-manual", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      payableId: "manual-1", expectedGiroPayableId: "d3",
      expectedGiro: { amount: 100000, debtDate: "2026-10-01", payableDebtDate: "2026-10-01", payableNote: "Catatan giro terdahulu", dueDate: "2026-11-05", supplierName: "Toko Tiga" },
      expectedManual: { amount: 100000, debtDate: "2026-09-30", dueDate: null, supplierName: "Toko Satu", note: "Rincian hutang manual" },
      expectedGiroPayments: item.payments, expectedManualPayments: manual.payments, historiesConfirmed: true,
      duplicatePayments: [{ giroPaymentId: "giro-pay", manualPaymentId: "manual-pay" }], matchingPaymentsConfirmedDistinct: false,
    });
  });

  it("meminta konfirmasi terpisah ketika pembayaran bernominal dan bertanggal sama adalah transaksi berbeda", async () => {
    expect(giroComponents).toHaveProperty("postGiroLink");
    const post = (giroComponents as unknown as { postGiroLink: (g: unknown, m: unknown, choices: Record<string, string>, confirmed: boolean, distinct: boolean, fetcher: typeof fetch) => Promise<void> }).postGiroLink;
    const item = { ...state.items[2], payments: [{ id: "giro-pay", amount: 30000, paidAt: "2026-10-03" }] };
    const manual = { id: "manual-1", supplierName: "Toko Satu", amount: 100000, debtDate: "2026-10-01", dueDate: null, payments: [{ id: "manual-pay", amount: 30000, paidAt: "2026-10-03" }] };
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(post(item, manual, { "manual-pay": "different" }, true, false, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await post(item, manual, { "manual-pay": "different" }, true, true, fetcher);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).matchingPaymentsConfirmedDistinct).toBe(true);
  });

  it("menghasilkan payload yang diterima parser dan perencana backend untuk pembayaran yang sama dan berbeda", async () => {
    const giro = { ...state.items[2], payableDebtDate: "2026-10-01", payments: [{ id: "giro-pay", amount: 30000, paidAt: "2026-10-03" }] };
    const manual = { id: "manual-1", supplierName: "Toko Tiga", amount: 100000, debtDate: "2026-10-01", dueDate: null, payments: [{ id: "m1", amount: 30000, paidAt: "2026-10-03" }, { id: "m2", amount: 30000, paidAt: "2026-10-03" }] };
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    await giroComponents.postGiroLink(giro as never, manual, { m1: "giro-pay", m2: "different" }, true, true, fetcher);
    const parsed = parseGiroLinkManual(JSON.parse(fetcher.mock.calls[0][1].body), "2026-11-02");
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error("Payload penautan tidak valid");
    const result = planStoredGiroLink({
      amount: giro.amount, giroDebtDate: giro.payableDebtDate, manualDebtDate: manual.debtDate,
      giroPayments: giro.payments.map(payment => ({ ...payment, requestScope: null })),
      manualPayments: manual.payments.map(payment => ({ ...payment, requestScope: null })),
    }, parsed, "2026-11-02");
    expect(result).toEqual({ debtDate: "2026-10-01", remainingCents: 4000000, duplicateManualIds: ["m1"] });
  });

  it("mengunci nilai pembayaran tertunda tanpa membatasi nominal dengan sisa baru", () => {
    const html = renderToStaticMarkup(<GiroPaymentFields item={state.items[3] as never} amount="100000" onAmountChange={() => {}} paidAt="2026-10-20" onPaidAtChange={() => {}} pending />);
    expect(html).toContain("100000");
    expect(html).toContain("readOnly");
    expect(html).not.toContain('max="0"');
  });

  it.skipIf(process.env.GIRO_BROWSER_TEST !== "1")("mengirim formulir pembayaran tertunda di browser setelah giro lunas", async () => {
    const html = renderToStaticMarkup(<form><GiroPaymentFields item={state.items[3] as never} amount="100000" onAmountChange={() => {}} paidAt="2026-10-20" onPaidAtChange={() => {}} pending /><button type="submit">Pastikan pembayaran</button></form>);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html);
      await page.evaluate(() => document.querySelector("form")!.addEventListener("submit", event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget as HTMLFormElement);
        document.body.dataset.sent = JSON.stringify(Object.fromEntries(data.entries()));
      }));
      await page.getByRole("button", { name: "Pastikan pembayaran" }).click();
      expect(await page.locator("body").getAttribute("data-sent")).toBe(JSON.stringify({ amount: "100000", paidAt: "2026-10-20" }));
    } finally { await browser.close(); }
  }, 30_000);

  it.skipIf(process.env.GIRO_BROWSER_TEST !== "1")("memakai kunci sama di dua tab serta setelah tab pertama ditutup", async () => {
    const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
    const { build } = requireFromVitest("esbuild") as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const bundle = await build({
      entryPoints: [path.resolve(process.cwd(), "features/keuangan/helpers/giro-payment-request.ts")],
      bundle: true, write: false, platform: "browser", format: "iife", globalName: "GiroPaymentHelper",
    });
    const server = createServer((_request, response) => { response.writeHead(200, { "Content-Type": "text/html" }); response.end("<!doctype html><title>Giro test</title>"); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server unavailable");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const first = await context.newPage(); const second = await context.newPage();
      const url = `http://127.0.0.1:${address.port}`;
      await Promise.all([first.goto(url), second.goto(url)]);
      await Promise.all([first.addScriptTag({ content: bundle.outputFiles[0].text }), second.addScriptTag({ content: bundle.outputFiles[0].text })]);
      await first.evaluate(() => {
        const w = window as unknown as { start?: () => void; release?: () => void; first?: Promise<void>; GiroPaymentHelper: { postGiroPayment: (...args: unknown[]) => Promise<void> } };
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        w.release = release;
        w.start = () => { w.first = w.GiroPaymentHelper.postGiroPayment(localStorage, { storeId: "store", userId: "user", payableId: "debt" }, { amount: "30000", paidAt: "2026-10-20", expectedBalance: "70000" }, async () => { document.body.dataset.started = "yes"; await gate; throw new TypeError("lost"); }, () => "b14f880a-fb50-43bc-a2aa-4733c8811dad").catch(() => {}); };
      });
      await first.evaluate(() => (window as unknown as { start: () => void }).start());
      await first.waitForFunction(() => document.body.dataset.started === "yes");
      await second.evaluate(() => {
        const w = window as unknown as { retry?: Promise<void>; GiroPaymentHelper: { postGiroPayment: (...args: unknown[]) => Promise<void> } };
        w.retry = w.GiroPaymentHelper.postGiroPayment(localStorage, { storeId: "store", userId: "user", payableId: "debt" }, { amount: "30000", paidAt: "2026-10-20", expectedBalance: "70000" }, async (_url: string, init: RequestInit) => { document.body.dataset.key = (init.headers as Record<string, string>)["Idempotency-Key"]; throw new TypeError("lost again"); }, () => "8e90eec3-8f6c-42f1-b67d-30c52e2a38dc").catch(() => {});
      });
      expect(await second.locator("body").getAttribute("data-key")).toBeNull();
      await first.evaluate(() => (window as unknown as { release: () => void }).release());
      await second.evaluate(async () => (window as unknown as { retry: Promise<void> }).retry);
      expect(await second.locator("body").getAttribute("data-key")).toBe("b14f880a-fb50-43bc-a2aa-4733c8811dad");
      await first.close();
      const reopened = await context.newPage(); await reopened.goto(url); await reopened.addScriptTag({ content: bundle.outputFiles[0].text });
      const replayKey = await reopened.evaluate(async () => {
        const helper = (window as unknown as { GiroPaymentHelper: { postGiroPayment: (...args: unknown[]) => Promise<void> } }).GiroPaymentHelper;
        let captured = "";
        await helper.postGiroPayment(localStorage, { storeId: "store", userId: "user", payableId: "debt" }, { amount: "30000", paidAt: "2026-10-20", expectedBalance: "70000" }, async (_url: string, init: RequestInit) => { captured = (init.headers as Record<string, string>)["Idempotency-Key"]; return new Response(JSON.stringify({ success: true }), { status: 201 }); });
        return captured;
      });
      expect(replayKey).toBe("b14f880a-fb50-43bc-a2aa-4733c8811dad");
    } finally {
      await browser.close();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, 30_000);

  it("menandai riwayat tidak konsisten dan tidak menyediakan aksi perubahan pada giro tersebut", () => {
    const html = renderToStaticMarkup(<SupplierPayablesPanel canCreate canUpdate />);
    const row = html.split("<li").find(part => part.includes("PB-005"));
    expect(row).toContain("Riwayat pembayaran tidak sesuai");
    expect(row).toContain("Tanggal kewajiban belum tersedia");
    expect(row).not.toContain(">Periksa riwayat</button>");
    expect(row).not.toContain(">Catat pembayaran</button>");
  });

  it("mengirim pembayaran giro pada endpoint hutang dan mempertahankan tanggalnya", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 201 }));
    await saveGiro("payment", state.items[2] as never, { amount: "30000", paidAt: "2026-10-20", payableId: "d3", payments: [], historyComplete: false }, fetcher, storage(), scope, lock);
    expect(fetcher).toHaveBeenCalledWith("/api/finance/supplier-payables/d3/payments", expect.objectContaining({ method: "POST", body: JSON.stringify({ amount: "30000", paidAt: "2026-10-20", expectedBalance: "70000" }) }));
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toEqual(expect.any(String));
  });

  it("mengirim hanya pembayaran tambahan saat menghubungkan riwayat giro", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ payableId: "manual-1" }), { status: 201 }));
    await saveGiro("review", state.items[0] as never, { amount: "", paidAt: "", payableId: "manual-1", payments: [{ amount: "30000", paidAt: "2026-10-12" }], expectedPayments: [{ amount: 20000, paidAt: "2026-10-03" }], historyComplete: true }, fetcher);
    expect(fetcher).toHaveBeenCalledWith("/api/finance/giro/g1/reconcile", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ payableId: "manual-1", payments: [{ amount: "30000", paidAt: "2026-10-12" }], expectedPayments: [{ amount: 20000, paidAt: "2026-10-03" }], historyComplete: true });
  });

  it("mengirim snapshot kosong untuk hutang tanpa pembayaran", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ payableId: "d2" }), { status: 201 }));
    await saveGiro("review", state.items[1] as never, { amount: "", paidAt: "", payableId: "d2", payments: [], expectedPayments: [], historyComplete: true }, fetcher);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).expectedPayments).toEqual([]);
  });

  it("mengidentifikasi perubahan riwayat agar pengguna diminta memeriksa ulang", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Riwayat berubah.", code: "HistoryChanged" }), { status: 409 }));
    await expect(saveGiro("review", state.items[0] as never, { amount: "", paidAt: "", payableId: "manual-1", payments: [], expectedPayments: [], historyComplete: true }, fetcher)).rejects.toMatchObject({ code: "HistoryChanged" });
  });

  it.skipIf(process.env.GIRO_BROWSER_TEST !== "1")("memuat riwayat berubah tanpa membuang input dan meminta konfirmasi ulang di browser", async () => {
    const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
    const { build } = requireFromVitest("esbuild") as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const bundle = await build({
      stdin: {
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { GiroDialog } from './features/keuangan/components/GiroPanel';
          const item = {goodsPurchaseId:'g1',number:'PB-001',supplierName:'Pemasok',amount:100000,debtDate:'2026-10-01',dueDate:'2026-11-05',payableId:null,status:'UNKNOWN',paid:null,remaining:null,payments:[]};
          const old = {id:'manual-1',supplierName:'Pemasok',amount:100000,paid:20000,debtDate:'2026-10-01',dueDate:null,payments:[{amount:20000,paidAt:'2026-10-03'}]};
          let requests = [];
          window.fetch = async (_url, options) => {
            requests.push(JSON.parse(options.body)); document.body.dataset.requests = JSON.stringify(requests);
            return requests.length === 1 ? new Response(JSON.stringify({code:'HistoryChanged',message:'Riwayat berubah.'}),{status:409}) : new Response(JSON.stringify({success:true}),{status:201});
          };
          const onRefreshReview = async () => ({items:[item],manualPayables:[{...old,paid:45000,payments:[...old.payments,{amount:25000,paidAt:'2026-10-04'}]}]});
          createRoot(document.getElementById('root')).render(<GiroDialog item={item} mode='review' manualPayables={[old]} scope={null} initialPending={null} onPendingChange={()=>{}} onClose={()=>{document.body.dataset.closed='yes'}} onSaved={async()=>{}} onRefreshReview={onRefreshReview}/>);
        `,
        resolveDir: process.cwd(), sourcefile: "giro-browser-harness.tsx", loader: "tsx",
      },
      alias: { "@": process.cwd() }, jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife",
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.getByLabel("Hutang yang sudah dicatat (opsional)").selectOption("manual-1");
      await page.getByRole("button", { name: "Tambahkan pembayaran sebelumnya" }).click();
      await page.getByLabel("Nominal pembayaran 1 (Rp)").fill("10000");
      await page.getByLabel("Tanggal pembayaran 1").fill("2026-10-06");
      await page.getByLabel("Saya memastikan riwayat pembayaran sudah lengkap").check();
      await page.getByRole("button", { name: "Simpan hasil pemeriksaan" }).click();
      await page.getByText("2026-10-04 · Rp", { exact: false }).waitFor();
      expect(await page.getByLabel("Nominal pembayaran 1 (Rp)").inputValue()).toBe("10000");
      expect(await page.getByLabel("Tanggal pembayaran 1").inputValue()).toBe("2026-10-06");
      expect(await page.getByLabel("Hutang yang sudah dicatat (opsional)").inputValue()).toBe("manual-1");
      expect(await page.getByLabel("Saya memastikan riwayat pembayaran sudah lengkap").isChecked()).toBe(false);
      const initial = JSON.parse((await page.locator("body").getAttribute("data-requests"))!);
      expect(initial[0].expectedPayments).toEqual([{ amount: 20000, paidAt: "2026-10-03" }]);
      await page.getByLabel("Saya memastikan riwayat pembayaran sudah lengkap").check();
      await page.getByRole("button", { name: "Simpan hasil pemeriksaan" }).click();
      await page.waitForFunction(() => document.body.dataset.closed === "yes");
      const sent = JSON.parse((await page.locator("body").getAttribute("data-requests"))!);
      expect(sent[1].expectedPayments).toEqual([{ amount: 20000, paidAt: "2026-10-03" }, { amount: 25000, paidAt: "2026-10-04" }]);
      expect(sent[1].payments).toEqual([{ amount: "10000", paidAt: "2026-10-06" }]);
    } finally { await browser.close(); }
  }, 60_000);

  it.skipIf(process.env.GIRO_BROWSER_TEST !== "1")("meninjau kedua hutang dan meminta pilihan ulang setelah riwayat berubah di browser", async () => {
    const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
    const { build } = requireFromVitest("esbuild") as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const bundle = await build({
      stdin: {
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { GiroLinkDialog } from './features/keuangan/components/GiroLinkDialog';
          const item = {goodsPurchaseId:'g1',number:'PB-001',supplierName:'Pemasok',amount:100000,debtDate:'2026-10-01',payableDebtDate:'2026-10-01',payableNote:'Catatan giro awal',dueDate:'2026-11-05',payableId:'g-debt',status:'PARTIAL',payments:[{id:'g-pay-1',amount:20000,paidAt:'2026-10-03'},{id:'g-pay-2',amount:10000,paidAt:'2026-10-04'}]};
          const manual = {id:'manual-1',supplierName:'Pemasok',amount:100000,debtDate:'2026-10-01',dueDate:null,note:'Catatan manual awal',payments:[{id:'m-pay-1',amount:20000,paidAt:'2026-10-03'},{id:'m-pay-2',amount:10000,paidAt:'2026-10-04'},{id:'m-pay-3',amount:5000,paidAt:'2026-10-05'}]};
          let requests = [];
          window.fetch = async (_url, options) => {
            requests.push(JSON.parse(options.body)); document.body.dataset.requests = JSON.stringify(requests);
            return requests.length === 1 ? new Response(JSON.stringify({code:'HistoryChanged',message:'Riwayat berubah.'}),{status:409}) : new Response('{}',{status:200});
          };
          const onRefresh = async () => ({items:[{...item,payableNote:'Catatan giro terbaru'}],manualPayables:[{...manual,note:'Catatan manual terbaru',payments:[...manual.payments,{id:'m-pay-4',amount:2000,paidAt:'2026-10-06'}]}]});
          createRoot(document.getElementById('root')).render(<GiroLinkDialog item={item} manualPayables={[manual]} onRefresh={onRefresh} onSaved={async()=>{document.body.dataset.saved='yes'}} onClose={()=>{document.body.dataset.closed='yes'}}/>);
        `,
        resolveDir: process.cwd(), sourcefile: "giro-link-browser-harness.tsx", loader: "tsx",
      },
      alias: { "@": process.cwd() }, jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife",
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const submit = page.getByRole("button", { name: "Hubungkan hutang", exact: true });
      const history = page.getByLabel("Saya sudah memeriksa kedua hutang dan riwayat pembayarannya.");
      const distinct = page.getByLabel("Saya telah memeriksa bukti dan memastikan pembayaran yang cocok tetapi tidak dipasangkan adalah transaksi berbeda.");
      await page.getByLabel("Hutang manual yang akan dihubungkan").selectOption("manual-1");
      expect(await page.getByRole("region", { name: "Riwayat pembayaran giro" }).textContent()).toContain("2026-10-03");
      expect(await page.getByRole("region", { name: "Riwayat pembayaran hutang manual" }).textContent()).toContain("2026-10-05");
      expect(await page.getByRole("region", { name: "Riwayat pembayaran giro" }).textContent()).toContain("Catatan giro awal");
      expect(await page.getByRole("region", { name: "Riwayat pembayaran hutang manual" }).textContent()).toContain("Catatan manual awal");
      expect(await submit.isDisabled()).toBe(true);
      await page.getByLabel("Periksa pembayaran manual 1 yang tanggal dan nominalnya sama").selectOption("g-pay-1");
      await page.getByLabel("Periksa pembayaran manual 2 yang tanggal dan nominalnya sama").selectOption("different");
      expect(await page.getByText("Setelah dihubungkan:", { exact: false }).textContent()).toContain("45.000");
      await history.check();
      expect(await submit.isDisabled()).toBe(true);
      await distinct.check();
      await submit.click();
      await page.getByText("Data terbaru dimuat. Periksa kembali kedua catatan dan tentukan ulang pilihan pembayaran.", { exact: false }).waitFor();
      expect((await page.getByRole("alert").allTextContents()).some(text => text.includes("Riwayat berubah."))).toBe(true);
      expect(await page.getByLabel("Periksa pembayaran manual 1 yang tanggal dan nominalnya sama").inputValue()).toBe("");
      expect(await page.getByLabel("Periksa pembayaran manual 2 yang tanggal dan nominalnya sama").inputValue()).toBe("");
      expect(await history.isChecked()).toBe(false);
      expect(await submit.isDisabled()).toBe(true);
      expect(await page.getByRole("region", { name: "Riwayat pembayaran giro" }).textContent()).toContain("Catatan giro terbaru");
      expect(await page.getByRole("region", { name: "Riwayat pembayaran hutang manual" }).textContent()).toContain("Catatan manual terbaru");
      await page.getByLabel("Periksa pembayaran manual 1 yang tanggal dan nominalnya sama").selectOption("g-pay-1");
      await page.getByLabel("Periksa pembayaran manual 2 yang tanggal dan nominalnya sama").selectOption("different");
      expect(await distinct.isChecked()).toBe(false);
      expect(await page.getByText("Setelah dihubungkan:", { exact: false }).textContent()).toContain("47.000");
      await history.check(); await distinct.check(); await submit.click();
      await page.waitForFunction(() => document.body.dataset.closed === "yes");
      const sent = JSON.parse((await page.locator("body").getAttribute("data-requests"))!);
      expect(sent).toHaveLength(2);
      expect(sent[0].duplicatePayments).toEqual([{ giroPaymentId: "g-pay-1", manualPaymentId: "m-pay-1" }]);
      expect(sent[0].matchingPaymentsConfirmedDistinct).toBe(true);
      expect(sent[1].expectedManualPayments).toHaveLength(4);
      expect(sent[0].expectedGiro.payableNote).toBe("Catatan giro awal");
      expect(sent[0].expectedManual.note).toBe("Catatan manual awal");
      expect(sent[1].expectedGiro.payableNote).toBe("Catatan giro terbaru");
      expect(sent[1].expectedManual.note).toBe("Catatan manual terbaru");
      expect(sent[1].duplicatePayments).toEqual(sent[0].duplicatePayments);
      expect(sent[1].historiesConfirmed).toBe(true);
      expect(await page.locator("body").getAttribute("data-saved")).toBe("yes");
    } finally { await browser.close(); }
  }, 60_000);

  it.skipIf(process.env.GIRO_BROWSER_TEST !== "1")("memblokir penautan saat data terbaru gagal dimuat atau giro sudah tidak tersedia", async () => {
    const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
    const { build } = requireFromVitest("esbuild") as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const bundle = await build({
      stdin: {
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { GiroLinkDialog } from './features/keuangan/components/GiroLinkDialog';
          const item = {goodsPurchaseId:'g1',number:'PB-001',supplierName:'Pemasok',amount:100000,debtDate:'2026-10-01',payableDebtDate:'2026-10-01',dueDate:'2026-11-05',payableId:'g-debt',status:'UNPAID',payments:[]};
          const manual = {id:'manual-1',supplierName:'Pemasok',amount:100000,debtDate:'2026-10-01',dueDate:null,payments:[]};
          let refreshes = 0;
          window.fetch = async () => new Response('{}',{status:404});
          const onRefresh = async () => { if (++refreshes === 1) throw new Error('offline'); return {items:[],manualPayables:[]}; };
          createRoot(document.getElementById('root')).render(<GiroLinkDialog item={item} manualPayables={[manual]} onRefresh={onRefresh} onSaved={async()=>{}} onClose={()=>{}}/>);
        `,
        resolveDir: process.cwd(), sourcefile: "giro-link-unavailable-harness.tsx", loader: "tsx",
      },
      alias: { "@": process.cwd() }, jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife",
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const submit = page.getByRole("button", { name: "Hubungkan hutang", exact: true });
      await page.getByLabel("Hutang manual yang akan dihubungkan").selectOption("manual-1");
      await page.getByLabel("Saya sudah memeriksa kedua hutang dan riwayat pembayarannya.").check();
      await submit.click();
      await page.getByText("Data terbaru belum dapat dimuat. Muat ulang sebelum menghubungkan hutang.").waitFor();
      expect(await submit.isDisabled()).toBe(true);
      await page.getByRole("button", { name: "Muat ulang data" }).click();
      await page.getByText("Giro sudah berubah atau tidak tersedia. Tutup formulir dan periksa daftar terbaru.").waitFor();
      expect(await submit.isDisabled()).toBe(true);
    } finally { await browser.close(); }
  }, 60_000);

  it("menampilkan pesan kegagalan dari server", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Nominal melebihi sisa hutang." }), { status: 422 }));
    await expect(saveGiro("payment", state.items[2] as never, { amount: "80000", paidAt: "2026-10-20", payableId: "d3", payments: [], historyComplete: false }, fetcher, storage(), scope, lock)).rejects.toThrow("Nominal melebihi sisa hutang.");
  });

  it("menyediakan status memuat dan percobaan ulang bila daftar gagal dimuat", () => {
    try {
      state.loading = true;
      expect(renderToStaticMarkup(<SupplierPayablesPanel canCreate canUpdate />)).toContain("Memuat giro...");
      state.loading = false;
      state.error = true;
      const html = renderToStaticMarkup(<SupplierPayablesPanel canCreate canUpdate />);
      expect(html).toContain("Giro belum dapat dimuat");
      expect(html).toContain("Coba lagi");
      expect(html).toContain('role="alert"');
    } finally { state.loading = false; state.error = false; }
  });
});
