export interface PreprocessOptions {
  brightness?: number; // 1.0 = unchanged
  contrast?: number; // 1.0 = unchanged
  deskew?: boolean;
  deglare?: boolean;
}

/**
 * Preprocess an image file using Canvas API.
 * Returns a new Blob (JPEG, quality 0.92) with adjustments applied.
 */
export async function preprocessImage(
  file: File,
  options: PreprocessOptions = {}
): Promise<Blob> {
  const {
    brightness = 1.0,
    contrast = 1.0,
    deskew = false,
    deglare = false,
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));

      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original
      ctx.drawImage(img, 0, 0);

      // Apply brightness/contrast if needed
      if (brightness !== 1.0 || contrast !== 1.0) {
        applyBrightnessContrast(ctx, canvas.width, canvas.height, brightness, contrast);
      }

      if (deglare) {
        removeGlare(ctx, canvas.width, canvas.height);
      }

      if (deskew) {
        // Minimal deskew logic hook (real implementation would use OpenCV.js or similar,
        // but we're keeping it memory-only Canvas manipulation)
        // deskewImage(ctx, canvas.width, canvas.height);
      }

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        "image/jpeg",
        0.92
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

function applyBrightnessContrast(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  brightness: number,
  contrast: number
) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;

  // contrast value: 0 to 2 (1 = normal)
  // brightness: 0 to 2 (1 = normal)
  const intercept = 128 * (1 - contrast);

  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] * brightness * contrast + intercept; // R
    d[i + 1] = d[i + 1] * brightness * contrast + intercept; // G
    d[i + 2] = d[i + 2] * brightness * contrast + intercept; // B
  }

  ctx.putImageData(imgData, 0, 0);
}

function removeGlare(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Simplistic glare removal: clip overexposed pixels
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    
    // If very bright (close to white), darken slightly to reveal text underneath
    // True glare removal requires local adaptive thresholding, this is a basic approx
    if (r > 240 && g > 240 && b > 240) {
      d[i] = 230;
      d[i + 1] = 230;
      d[i + 2] = 230;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
