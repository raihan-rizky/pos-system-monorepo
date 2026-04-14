import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import fs from "fs";

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ message: "No file received." }, { status: 400 });
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { message: "File type not allowed. Only JPEG, PNG, WebP, GIF, and AVIF are accepted." },
        { status: 415 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { message: "File too large. Maximum size is 5 MB." },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name).toLowerCase() || `.${file.type.split("/")[1]}`;
    const filename = `${crypto.randomBytes(8).toString("hex")}${ext}`;

    const publicDir = path.join(process.cwd(), "public", "images");
    await fs.promises.mkdir(publicDir, { recursive: true });

    const filepath = path.join(publicDir, filename);
    await writeFile(filepath, buffer);

    const imageUrl = `/images/${filename}`;
    return NextResponse.json({ url: imageUrl }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload image:", error);
    return NextResponse.json(
      { message: "Failed to upload image" },
      { status: 500 }
    );
  }
}
