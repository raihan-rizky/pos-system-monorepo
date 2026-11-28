import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
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

const PRODUCT_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
let productImageClient: S3Client | undefined;

function productImageObjectKey(imageUrl: string, publicBaseUrl: string) {
  try {
    const url = new URL(imageUrl);
    const base = new URL(publicBaseUrl);
    const prefix = `${base.pathname.replace(/\/+$/, "")}/`;
    if (
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      !url.pathname.startsWith(`${prefix}products/`)
    ) {
      return null;
    }
    return getR2MediaObjectKey(decodeURIComponent(url.pathname.slice(prefix.length)));
  } catch {
    return null;
  }
}

export async function readProductImageFromR2(
  imageUrl: string,
  dependencies?: {
    env?: R2Environment;
    send?: (command: GetObjectCommand) => Promise<GetObjectCommandOutput>;
  },
) {
  const env = dependencies?.env ?? process.env;
  const publicBaseUrl = env.R2_PUBLIC_BASE_URL;
  const key = publicBaseUrl ? productImageObjectKey(imageUrl, publicBaseUrl) : null;
  if (!key) return null;

  const config = getR2MediaStorageConfig(env);
  const command = new GetObjectCommand({ Bucket: config.bucketName, Key: key });

  try {
    const object = dependencies?.send
      ? await dependencies.send(command)
      : await (productImageClient ??= createR2Client(config)).send(command, {
          abortSignal: AbortSignal.timeout(6_000),
        });
    if (!object.Body) return null;

    const body = object.Body.transformToWebStream();
    const contentType = object.ContentType?.split(";", 1)[0].trim().toLowerCase();
    if (!contentType || !PRODUCT_IMAGE_CONTENT_TYPES.has(contentType)) {
      await body.cancel();
      return null;
    }
    return { body, contentType };
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
      return null;
    }
    throw new MediaStorageUnavailableError();
  }
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
