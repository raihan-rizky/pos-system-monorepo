import sharp from "sharp";

export class ProofPreprocessingError extends Error {
  constructor() {
    super("Gambar tidak dapat diproses. Pilih ulang gambar atau gunakan prnt.sc.");
    this.name = "ProofPreprocessingError";
  }
}

export function isProofPreprocessingError(error: unknown) {
  return error instanceof ProofPreprocessingError;
}

export async function preprocessProofImage(
  input: Buffer,
  mimeType: string,
) {
  try {
    const pipeline = sharp(input, { animated: mimeType === "image/gif" })
      .rotate()
      .resize({
        width: 1920,
        height: 1920,
        fit: "inside",
        withoutEnlargement: true,
      });

    const output =
      mimeType === "image/gif"
        ? pipeline.gif()
        : pipeline.webp({ quality: 80 });
    const { data, info } = await output.toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      mimeType: mimeType === "image/gif" ? "image/gif" : "image/webp",
      extension: mimeType === "image/gif" ? ".gif" : ".webp",
      width: info.width,
      height: info.height,
      inputBytes: input.byteLength,
      outputBytes: data.byteLength,
    };
  } catch {
    throw new ProofPreprocessingError();
  }
}
