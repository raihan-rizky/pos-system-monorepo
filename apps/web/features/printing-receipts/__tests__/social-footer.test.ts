import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { getPrintingReceiptLayout } from "../layout";

describe("printing receipt contact footer", () => {
  it("reuses the Spanduk social media strip below the A5 signature", async () => {
    const template = (category: "PERCETAKAN" | "SPANDUK") =>
      sharp(resolve("public", getPrintingReceiptLayout(category).artwork.slice(1)));
    const strip = { width: 946, height: 46 };
    const a5 = template("PERCETAKAN");
    const spanduk = template("SPANDUK");
    const { width, height } = await a5.metadata();
    expect({ width, height }).toEqual({ width: 1269, height: 1800 });

    const expected = await spanduk.extract({ left: 786, top: 842, ...strip }).removeAlpha().raw().toBuffer();
    const left = Math.floor((width - strip.width) / 2);
    const footer = await a5.extract({ left, top: 1719, ...strip }).removeAlpha().raw().toBuffer();

    expect(footer.equals(expected)).toBe(true);
  });
});
