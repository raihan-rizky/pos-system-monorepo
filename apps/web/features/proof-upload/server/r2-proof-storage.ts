import crypto from "crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type R2Environment = Record<string, string | undefined>;

type R2ProofStorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  publicBaseUrl: string;
};

export class ProofStorageUnavailableError extends Error {
  constructor(message = "Penyimpanan R2 sedang tidak tersedia.") {
    super(message);
    this.name = "ProofStorageUnavailableError";
  }
}

export function isProofStorageUnavailableError(error: unknown) {
  return error instanceof ProofStorageUnavailableError;
}

export class InvalidProofObjectError extends Error {
  constructor() {
    super("Tautan bukan bukti R2 yang dapat dihapus.");
    this.name = "InvalidProofObjectError";
  }
}

export function isInvalidProofObjectError(error: unknown) {
  return error instanceof InvalidProofObjectError;
}

export function getR2ProofStorageConfig(
  env: R2Environment = process.env,
): R2ProofStorageConfig {
  const config = {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
    endpoint: env.R2_ENDPOINT,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL,
  };

  if (Object.values(config).some((value) => !value?.trim())) {
    throw new ProofStorageUnavailableError(
      "Konfigurasi penyimpanan R2 belum lengkap.",
    );
  }

  return config as R2ProofStorageConfig;
}

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function getR2ProofObjectKey(rawUrl: string, publicBaseUrl: string) {
  try {
    const candidate = new URL(rawUrl);
    const base = new URL(publicBaseUrl);
    if (candidate.protocol !== "https:" || candidate.origin !== base.origin) {
      throw new InvalidProofObjectError();
    }

    const objectKey = decodeURIComponent(candidate.pathname.replace(/^\/+/, ""));
    const segments = objectKey.split("/");
    if (
      !objectKey.startsWith("proofs/") ||
      segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))
    ) {
      throw new InvalidProofObjectError();
    }
    return objectKey;
  } catch (error) {
    if (error instanceof InvalidProofObjectError) throw error;
    throw new InvalidProofObjectError();
  }
}

export async function deleteProofFromR2(
  url: string,
  dependencies?: {
    env?: R2Environment;
    send?: (command: DeleteObjectCommand) => Promise<unknown>;
  },
) {
  const config = getR2ProofStorageConfig(dependencies?.env);
  const objectKey = getR2ProofObjectKey(url, config.publicBaseUrl);
  const command = new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey,
  });

  try {
    if (dependencies?.send) {
      await dependencies.send(command);
    } else {
      const client = new S3Client({
        region: "auto",
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
      await client.send(command);
    }
  } catch {
    throw new ProofStorageUnavailableError();
  }

  return { objectKey };
}

export async function uploadProofToR2(
  input: {
    body: Buffer;
    mimeType: string;
    prefix: string;
    scopeId: string;
    extension: string;
  },
  dependencies?: {
    env?: R2Environment;
    randomHex?: () => string;
    send?: (command: PutObjectCommand) => Promise<unknown>;
  },
) {
  const config = getR2ProofStorageConfig(dependencies?.env);
  const randomHex = dependencies?.randomHex ?? (() => crypto.randomBytes(16).toString("hex"));
  const objectKey = `${input.prefix}/${safePathSegment(input.scopeId)}/${randomHex()}${input.extension}`;
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey,
    Body: input.body,
    ContentType: input.mimeType,
    CacheControl: "public, max-age=31536000, immutable",
  });

  try {
    if (dependencies?.send) {
      await dependencies.send(command);
    } else {
      const client = new S3Client({
        region: "auto",
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
      await client.send(command);
    }
  } catch {
    throw new ProofStorageUnavailableError();
  }

  return {
    objectKey,
    url: `${config.publicBaseUrl.replace(/\/$/, "")}/${objectKey}`,
  };
}
