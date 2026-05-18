import { describe, it, expect } from "vitest";
import { generateSku, normalizeIndonesianPrice } from "../sku-generator";

describe("generateSku", () => {
  it("generates SKU from product name and category", () => {
    const sku = generateSku("Kertas A4 80gsm", "Kertas");
    expect(sku).toMatch(/^KER-/);
    expect(sku.length).toBeLessThanOrEqual(20);
  });

  it("generates different SKUs for different products", () => {
    const sku1 = generateSku("Kertas A4 80gsm", "Kertas");
    const sku2 = generateSku("Tinta Epson L3150", "Tinta");
    expect(sku1).not.toBe(sku2);
  });

  it("extracts alphanumeric tokens from name", () => {
    const sku = generateSku("Tinta Epson L3150", "Tinta");
    expect(sku).toContain("EPS");
  });

  it("handles names with special characters", () => {
    const sku = generateSku("Amplop (Ukuran) A4 - Putih", "Amplop");
    expect(sku).toBeTruthy();
    expect(sku).toMatch(/^[A-Z0-9-]+$/);
  });

  it("generates uppercase SKU with hyphens only", () => {
    const sku = generateSku("kertas hvs a4", "Kertas");
    expect(sku).toMatch(/^[A-Z0-9-]+$/);
  });

  it("handles single-word names", () => {
    const sku = generateSku("Stapler", "Alat Tulis");
    expect(sku).toBeTruthy();
    expect(sku.length).toBeGreaterThan(0);
  });
});

describe("normalizeIndonesianPrice", () => {
  it("converts Indonesian dot-separated thousands to number", () => {
    expect(normalizeIndonesianPrice("25.000")).toBe(25000);
  });

  it("converts number with Rp prefix", () => {
    expect(normalizeIndonesianPrice("Rp 55.000")).toBe(55000);
  });

  it("converts number with Rp. prefix", () => {
    expect(normalizeIndonesianPrice("Rp. 125.000")).toBe(125000);
  });

  it("converts number with IDR prefix", () => {
    expect(normalizeIndonesianPrice("IDR 1.500.000")).toBe(1500000);
  });

  it("passes through plain numbers", () => {
    expect(normalizeIndonesianPrice(25000)).toBe(25000);
    expect(normalizeIndonesianPrice("25000")).toBe(25000);
  });

  it("handles decimal comma format", () => {
    expect(normalizeIndonesianPrice("25.000,50")).toBe(25000.5);
  });

  it("returns 0 for empty or invalid input", () => {
    expect(normalizeIndonesianPrice("")).toBe(0);
    expect(normalizeIndonesianPrice("abc")).toBe(0);
  });

  it("handles numbers with spaces", () => {
    expect(normalizeIndonesianPrice(" 55.000 ")).toBe(55000);
  });
});
