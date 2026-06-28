import { describe, expect, it } from "vitest";
import { skuFromFilename, filterImageFiles } from "../bulk-photo-import";

describe("skuFromFilename", () => {
  it("strips extension and lowercases", () => {
    expect(skuFromFilename("ATK-027.jpg")).toBe("atk-027");
  });

  it("handles uppercase extension", () => {
    expect(skuFromFilename("PRODUCT-ABC.PNG")).toBe("product-abc");
  });

  it("handles multi-dot name (takes last dot as extension)", () => {
    expect(skuFromFilename("item.v2.webp")).toBe("item.v2");
  });

  it("trims whitespace", () => {
    expect(skuFromFilename("  sku-001.jpg  ")).toBe("sku-001");
  });

  it("file with no extension stays as-is lowercased", () => {
    expect(skuFromFilename("SKU001")).toBe("sku001");
  });

  it("empty string returns empty", () => {
    expect(skuFromFilename("")).toBe("");
  });
});

function makeFile(name: string, type: string): File {
  return new File(["x"], name, { type });
}

function makeFileList(files: File[]): FileList {
  return Object.assign(files, { item: (i: number) => files[i] ?? null }) as unknown as FileList;
}

describe("filterImageFiles", () => {
  it("returns null as empty array", () => {
    expect(filterImageFiles(null)).toEqual([]);
  });

  it("accepts jpeg, png, webp, gif, avif", () => {
    const files = [
      makeFile("a.jpg", "image/jpeg"),
      makeFile("b.png", "image/png"),
      makeFile("c.webp", "image/webp"),
      makeFile("d.gif", "image/gif"),
      makeFile("e.avif", "image/avif"),
    ];
    expect(filterImageFiles(makeFileList(files))).toHaveLength(5);
  });

  it("rejects non-image MIME even if extension looks like image", () => {
    const files = [makeFile("hack.jpg", "application/octet-stream")];
    expect(filterImageFiles(makeFileList(files))).toHaveLength(0);
  });

  it("rejects image MIME with wrong extension (e.g. .exe)", () => {
    const files = [makeFile("virus.exe", "image/jpeg")];
    expect(filterImageFiles(makeFileList(files))).toHaveLength(0);
  });

  it("rejects PDF", () => {
    const files = [makeFile("doc.pdf", "application/pdf")];
    expect(filterImageFiles(makeFileList(files))).toHaveLength(0);
  });

  it("mixed: keeps only valid images", () => {
    const files = [
      makeFile("ok.jpg", "image/jpeg"),
      makeFile("bad.pdf", "application/pdf"),
      makeFile("ok2.png", "image/png"),
    ];
    const result = filterImageFiles(makeFileList(files));
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.name)).toEqual(["ok.jpg", "ok2.png"]);
  });

  it("empty FileList returns empty array", () => {
    expect(filterImageFiles(makeFileList([]))).toHaveLength(0);
  });
});
