import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedManualTransferProof } from "../manual-transfer-proof";

afterEach(() => vi.unstubAllEnvs());

describe("bukti transfer milik toko", () => {
  it("menerima bukti R2 milik toko dan tautan prnt.sc", () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://pub-example.r2.dev");
    expect(isAllowedManualTransferProof("https://pub-example.r2.dev/proofs/manual-transfers/store-1/a.webp", "store-1")).toBe(true);
    expect(isAllowedManualTransferProof("https://pub-example.r2.dev/proofs/expenses/store-1/legacy.webp", "store-1")).toBe(true);
    expect(isAllowedManualTransferProof("https://prnt.sc/abc", "store-1")).toBe(true);
  });
  it("menolak asal, toko, dan konteks bukti lain", () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://pub-example.r2.dev");
    expect(isAllowedManualTransferProof("https://elsewhere.test/proofs/manual-transfers/store-1/a.webp", "store-1")).toBe(false);
    expect(isAllowedManualTransferProof("https://pub-example.r2.dev/proofs/manual-transfers/store-2/a.webp", "store-1")).toBe(false);
    expect(isAllowedManualTransferProof("https://pub-example.r2.dev/proofs/transactions/store-1/a.webp", "store-1")).toBe(false);
  });
});
