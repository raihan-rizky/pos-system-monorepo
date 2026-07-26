import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

type R2Environment = Record<string, string | undefined>;

type R2MediaStorageConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  publicBaseUrl: string;
};

export class MediaStorageUnavailableError extends Error {
  constructor(message = "Penyimpanan media R2 sedang tidak tersedia.") {
    super(message);
    this.name = "MediaStorageUnavailableError";
  }
}

export function isMediaStorageUnavailableError(error: unknown) {
  return error instanceof MediaStorageUnavailableError;
}

export class InvalidMediaObjectKeyError extends Error {
  constructor() {
    super("Path media R2 tidak valid.");
    this.name = "InvalidMediaObjectKeyError";
  }
}

function getR2MediaStorageConfig(
  env: R2Environment = process.env,
): R2MediaStorageConfig {
  const config = {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
    endpoint: env.R2_ENDPOINT,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL,
  };

  if (Object.values(config).some((value) => !value?.trim())) {
    throw new MediaStorageUnavailableError(
      "Konfigurasi penyimpanan media R2 belum lengkap.",
    );
  }

  return config as R2MediaStorageConfig;
}

export function getR2MediaObjectKey(objectKey: string) {
  const segments = objectKey.split("/");
  const namespace = segments[0];
  if (
    !["products", "expenses"].includes(namespace) ||
    segments.length < 2 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\\"),
    )
  ) {
    throw new InvalidMediaObjectKeyError();
  }

  return objectKey;
}

function createR2Client(config: R2MediaStorageConfig) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function uploadMediaToR2(
  input: {
    body: Buffer;
    mimeType: string;
    objectKey: string;
  },
  dependencies?: {
    env?: R2Environment;
    send?: (command: PutObjectCommand) => Promise<unknown>;
  },
) {
  const config = getR2MediaStorageConfig(dependencies?.env);
  const objectKey = getR2MediaObjectKey(input.objectKey);
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
      await createR2Client(config).send(command);
    }
  } catch {
    throw new MediaStorageUnavailableError();
  }

  return {
    objectKey,
    url: `${config.publicBaseUrl.replace(/\/$/, "")}/${objectKey}`,
  };
}

export async function deleteMediaFromR2(
  rawObjectKey: string,
  dependencies?: {
    env?: R2Environment;
    send?: (command: DeleteObjectCommand) => Promise<unknown>;
  },
) {
  const config = getR2MediaStorageConfig(dependencies?.env);
  const objectKey = getR2MediaObjectKey(rawObjectKey);
  const command = new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey,
  });

  try {
    if (dependencies?.send) {
      await dependencies.send(command);
    } else {
      await createR2Client(config).send(command);
    }
  } catch {
    throw new MediaStorageUnavailableError();
  }

  return { objectKey };
}
