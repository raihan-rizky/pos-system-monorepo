import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  ProofPreprocessingError,
  preprocessProofImage,
} from "../preprocess-proof-image";

describe("preprocessProofImage", () => {
  it("resizes a large JPEG and converts it to metadata-free WebP", async () => {
    const input = await sharp({
      create: {
        width: 3000,
        height: 1000,
        channels: 3,
        background: "#ef4444",
      },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "private" } } })
      .toBuffer();

    const result = await preprocessProofImage(input, "image/jpeg");
    const metadata = await sharp(result.buffer).metadata();

    expect(result.mimeType).toBe("image/webp");
    expect(result.extension).toBe(".webp");
    expect(result.width).toBe(1920);
    expect(result.height).toBe(640);
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
  });

  it("does not enlarge an image below the maximum dimensions", async () => {
    const input = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: "#22c55e",
      },
    })
      .png()
      .toBuffer();

    const result = await preprocessProofImage(input, "image/png");

    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
  });

  it("persists a requested clockwise quarter-turn", async () => {
    const input = await sharp({
      create: {
        width: 640,
        height: 320,
        channels: 3,
        background: "#f59e0b",
      },
    }).png().toBuffer();

    const result = await preprocessProofImage(input, "image/png", 90);

    expect(result.width).toBe(320);
    expect(result.height).toBe(640);
  });

  it("keeps GIF output as GIF", async () => {
    const input = await sharp({
      create: {
        width: 24,
        height: 24,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 },
      },
    })
      .gif()
      .toBuffer();

    const result = await preprocessProofImage(input, "image/gif");
    const metadata = await sharp(result.buffer, { animated: true }).metadata();

    expect(result.mimeType).toBe("image/gif");
    expect(result.extension).toBe(".gif");
    expect(metadata.format).toBe("gif");
  });

  it("wraps corrupt image failures in a preprocessing error", async () => {
    await expect(
      preprocessProofImage(Buffer.from("not-an-image"), "image/jpeg"),
    ).rejects.toBeInstanceOf(ProofPreprocessingError);
  });
});
