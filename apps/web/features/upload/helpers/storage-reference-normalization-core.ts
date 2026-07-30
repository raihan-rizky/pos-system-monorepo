type StorageReferenceRow = {
  id: string;
  imageUrl: string | null;
};

type PlannedStorageReferenceUpdate = {
  id: string;
  before: string;
  after: string;
  objectKey: string;
};

export function parseStorageReferenceNormalizationOptions(args: string[]) {
  const normalizedArgs = args.filter((arg) => arg !== "--");
  const unknownArgs = normalizedArgs.filter(
    (arg) => arg !== "--apply" && !arg.startsWith("--expected-count="),
  );
  if (unknownArgs.length > 0) {
    throw new Error(`Argumen tidak dikenal: ${unknownArgs.join(", ")}`);
  }

  const apply = normalizedArgs.includes("--apply");
  const expectedCountArg = normalizedArgs.find((arg) =>
    arg.startsWith("--expected-count="),
  );
  const rawExpectedCount = expectedCountArg?.slice(
    "--expected-count=".length,
  );
  const expectedCount =
    rawExpectedCount === undefined ? null : Number(rawExpectedCount);

  if (
    expectedCount !== null &&
    (!Number.isInteger(expectedCount) || expectedCount < 0)
  ) {
    throw new Error("--expected-count harus bilangan bulat non-negatif.");
  }
  if (apply && expectedCount === null) {
    throw new Error("--expected-count wajib saat memakai --apply.");
  }

  return { apply, expectedCount };
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

function buildPublicObjectUrl(baseUrl: string, objectKey: string) {
  const encodedKey = objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl.replace(/\/+$/, "")}/${encodedKey}`;
}

export function parseSupabasePublicObjectKey(
  rawUrl: string,
  sourceBaseUrl: string,
) {
  try {
    const sourceBase = normalizeBaseUrl(sourceBaseUrl);
    const candidate = new URL(rawUrl);
    const expectedPrefix = `${sourceBase.pathname}/`;

    if (
      candidate.protocol !== "https:" ||
      candidate.origin !== sourceBase.origin ||
      !candidate.pathname.startsWith(expectedPrefix) ||
      candidate.search ||
      candidate.hash
    ) {
      return null;
    }

    const encodedKey = candidate.pathname.slice(expectedPrefix.length);
    const segments = encodedKey
      .split("/")
      .map((segment) => decodeURIComponent(segment));

    if (
      segments.length < 2 ||
      segments.some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          segment.includes("\\"),
      )
    ) {
      return null;
    }

    return segments.join("/");
  } catch {
    return null;
  }
}

export function planNormalizedStorageReferenceUpdates(input: {
  rows: StorageReferenceRow[];
  availableObjectKeys: ReadonlySet<string>;
  sourceBaseUrl: string;
  targetBaseUrl: string;
}) {
  const updates: PlannedStorageReferenceUpdate[] = [];
  let skippedMissingObject = 0;
  let skippedInvalidUrl = 0;

  for (const row of input.rows) {
    if (!row.imageUrl) {
      skippedInvalidUrl += 1;
      continue;
    }

    const objectKey = parseSupabasePublicObjectKey(
      row.imageUrl,
      input.sourceBaseUrl,
    );
    if (!objectKey) {
      skippedInvalidUrl += 1;
      continue;
    }
    if (!input.availableObjectKeys.has(objectKey)) {
      skippedMissingObject += 1;
      continue;
    }

    updates.push({
      id: row.id,
      before: row.imageUrl,
      after: buildPublicObjectUrl(input.targetBaseUrl, objectKey),
      objectKey,
    });
  }

  return { updates, skippedMissingObject, skippedInvalidUrl };
}

export function planMissingStorageReferenceClears(input: {
  rows: StorageReferenceRow[];
  availableObjectKeys: ReadonlySet<string>;
  sourceBaseUrl: string;
}) {
  const clears: Array<{
    id: string;
    before: string;
    objectKey: string;
  }> = [];
  let skippedExistingObject = 0;
  let skippedInvalidUrl = 0;

  for (const row of input.rows) {
    if (!row.imageUrl) {
      skippedInvalidUrl += 1;
      continue;
    }
    const objectKey = parseSupabasePublicObjectKey(
      row.imageUrl,
      input.sourceBaseUrl,
    );
    if (!objectKey) {
      skippedInvalidUrl += 1;
      continue;
    }
    if (input.availableObjectKeys.has(objectKey)) {
      skippedExistingObject += 1;
      continue;
    }
    clears.push({ id: row.id, before: row.imageUrl, objectKey });
  }

  return { clears, skippedExistingObject, skippedInvalidUrl };
}
