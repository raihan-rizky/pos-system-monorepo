import { describe, expect, it } from "vitest";
import { createStockUpdateNotification } from "../stock-update-notification";

describe("createStockUpdateNotification", () => {
  it("membuat notifikasi sukses untuk pengajuan update stok", () => {
    expect(createStockUpdateNotification("success", "Permintaan berhasil dibuat.")).toEqual({
      kind: "success",
      title: "Update stok berhasil",
      message: "Permintaan berhasil dibuat.",
    });
  });

  it("membuat notifikasi gagal untuk pengajuan update stok", () => {
    expect(createStockUpdateNotification("error", "Gagal menyimpan perubahan.")).toEqual({
      kind: "error",
      title: "Update stok gagal",
      message: "Gagal menyimpan perubahan.",
    });
  });
});
