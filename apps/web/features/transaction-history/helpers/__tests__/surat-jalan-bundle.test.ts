import { describe, expect, it } from "vitest";
import {
  formatSuratJalanBundleProgress,
  isSuratJalanBundle,
} from "../surat-jalan-bundle";

describe("surat jalan bundle helpers", () => {
  it("detects transactions with at least one surat jalan", () => {
    expect(
      isSuratJalanBundle({
        suratJalanSummary: {
          count: 1,
          confirmedCount: 1,
          pendingCount: 0,
          deliveredQuantity: 2,
          totalQuantity: 5,
        },
      }),
    ).toBe(true);
  });

  it("does not mark transactions without surat jalan as bundles", () => {
    expect(isSuratJalanBundle({ suratJalanSummary: null })).toBe(false);
    expect(
      isSuratJalanBundle({
        suratJalanSummary: {
          count: 0,
          confirmedCount: 0,
          pendingCount: 0,
          deliveredQuantity: 0,
          totalQuantity: 5,
        },
      }),
    ).toBe(false);
  });

  it("formats concise bundle progress", () => {
    expect(
      formatSuratJalanBundleProgress({
        count: 2,
        confirmedCount: 1,
        pendingCount: 1,
        deliveredQuantity: 7,
        totalQuantity: 10,
      }),
    ).toBe("2 surat jalan • 7/10 item terkirim");
  });
});
