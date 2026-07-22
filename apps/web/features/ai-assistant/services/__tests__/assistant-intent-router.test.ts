import { describe, expect, it } from "vitest";
import { parseFastPathIntentAllowlist, routeAssistantIntent } from "../assistant-intent-router";

describe("routeAssistantIntent", () => {
  it("routes low-stock questions to get_low_stock_items", () => {
    expect(routeAssistantIntent("produk apa yang stoknya rendah?")).toEqual({
      kind: "tool",
      toolName: "get_low_stock_items",
      input: {},
    });
  });

  it("routes the inventory template to get_low_stock_items", () => {
    expect(routeAssistantIntent("Cek stok barang menipis")).toMatchObject({
      kind: "tool",
      toolName: "get_low_stock_items",
    });
  });

  it("routes daily sales questions to get_daily_sales_summary", () => {
    expect(routeAssistantIntent("omzet hari ini berapa?", new Date("2026-06-26T10:00:00Z"))).toEqual({
      kind: "tool",
      toolName: "get_daily_sales_summary",
      input: { date: "2026-06-26" },
    });
  });

  it("routes system help questions to get_system_help", () => {
    expect(routeAssistantIntent("bagaimana cara tambah produk?")).toEqual({
      kind: "tool",
      toolName: "get_system_help",
      input: { query: "bagaimana cara tambah produk?" },
    });
  });

  it("routes product search questions to get_product_search", () => {
    expect(routeAssistantIntent("cari produk A4")).toEqual({
      kind: "tool",
      toolName: "get_product_search",
      input: { query: "A4", limit: 10 },
    });
  });

  it("routes product stock questions to get_product_stock", () => {
    expect(routeAssistantIntent("stok Kertas A4 berapa?")).toEqual({
      kind: "tool",
      toolName: "get_product_stock",
      input: { query: "Kertas A4" },
    });
  });

  it("routes product price questions to get_product_price", () => {
    expect(routeAssistantIntent("harga Kertas A4 berapa?")).toEqual({
      kind: "tool",
      toolName: "get_product_price",
      input: { query: "Kertas A4" },
    });
  });

  it("routes customer search questions to get_customer_search", () => {
    expect(routeAssistantIntent("cari customer Budi")).toEqual({
      kind: "tool",
      toolName: "get_customer_search",
      input: { query: "Budi", limit: 10 },
    });
  });

  it("routes customer debt questions to get_customer_debt_summary", () => {
    expect(routeAssistantIntent("piutang customer Budi berapa?")).toEqual({
      kind: "tool",
      toolName: "get_customer_debt_summary",
      input: { query: "Budi" },
    });
  });

  it("routes customer recap questions to get_customer_recap_summary", () => {
    expect(routeAssistantIntent("rekap customer Budi", new Date("2026-06-26T10:00:00Z"))).toEqual({
      kind: "tool",
      toolName: "get_customer_recap_summary",
      input: { query: "Budi", preset: "30d" },
    });
  });

  it("routes deterministic social greetings", () => {
    expect(routeAssistantIntent("halo")).toEqual({
      kind: "social_static",
      reply: expect.stringContaining("Pak Teladan"),
    });
  });

  it("routes broader social chat to Nebius", () => {
    expect(routeAssistantIntent("lagi ngapain Dan?")).toEqual({ kind: "social_nebius" });
  });

  it("routes explicit joke requests to static social reply", () => {
    expect(routeAssistantIntent("kasih jokes dong")).toEqual({
      kind: "social_static",
      reply: expect.stringContaining("Xixixi"),
    });
  });

  it("routes unsupported in-scope data questions to guidance", () => {
    expect(routeAssistantIntent("supplier mana yang paling sering kirim barang?")).toEqual({
      kind: "unsupported_data",
      guidance: expect.stringContaining("belum bisa"),
    });
  });

  it("blocks unrelated questions as out of scope", () => {
    expect(routeAssistantIntent("siapa presiden amerika?"))
      .toEqual({ kind: "out_of_scope" });
  });

  it("defaults financial exports to the latest 30 days as PDF", () => {
    expect(routeAssistantIntent("ekspor laporan keuangan")).toEqual({
      kind: "tool",
      toolName: "exportFinancialReport",
      input: { period: "30d", format: "pdf" },
    });
  });

  it("honors an explicit export period and format", () => {
    expect(routeAssistantIntent("ekspor laporan keuangan mingguan ke excel")).toEqual({
      kind: "tool",
      toolName: "exportFinancialReport",
      input: { period: "weekly", format: "xlsx" },
    });
  });

  it("routes the owner monthly recap quick prompts to prepared PDF exports", () => {
    expect(routeAssistantIntent("Rekap finansial bulanan")).toEqual({
      kind: "tool",
      toolName: "exportFinancialReport",
      input: { period: "monthly", format: "pdf" },
    });
    expect(routeAssistantIntent("Rekap pelanggan bulanan")).toEqual({
      kind: "tool",
      toolName: "exportCustomerRecap",
      input: { period: "monthly", format: "pdf" },
    });
  });

  it("defaults customer recap exports to the latest 30 days as PDF", () => {
    expect(routeAssistantIntent("buatkan rekap pelanggan")).toEqual({
      kind: "tool",
      toolName: "exportCustomerRecap",
      input: { period: "30d", format: "pdf" },
    });
  });

  it("routes whole financial page analysis to the aggregate report tool", () => {
    expect(routeAssistantIntent("analisis seluruh laporan keuangan 30 hari")).toEqual({
      kind: "tool",
      toolName: "analyzeFinancialReport",
      input: { period: "30d" },
    });
  });

  it.each([
    ["tambah produk baru", "openProductModal"],
    ["buka modal tambah pelanggan", "openCustomerModal"],
    ["tambah supplier baru", "openSupplierModal"],
    ["tambah sales baru", "openSalespersonModal"],
    ["catat pengeluaran baru", "openExpenseModal"],
    ["buka shift kasir", "openShiftModal"],
    ["update stok satu produk", "openStockUpdateModal"],
    ["input penerimaan barang", "openInboundReceiptModal"],
  ])("routes core modal request %s to %s", (message, toolName) => {
    expect(routeAssistantIntent(message)).toEqual({
      kind: "tool",
      toolName,
      input: {},
    });
  });

  it.each([
    "cek stok yang tadi",
    "harga Kertas A4 dan cek stoknya",
    "maksud saya harga Kertas F4",
    "stok produk ini berapa?",
  ])("falls back for contextual or mixed input: %s", (message) => {
    expect(routeAssistantIntent(message)).toEqual({ kind: "chat" });
  });

  it("accepts only known allowlist values", () => {
    expect([...parseFastPathIntentAllowlist(" social_static,unknown,get_low_stock_items ")])
      .toEqual(["social_static", "get_low_stock_items"]);
  });
});
