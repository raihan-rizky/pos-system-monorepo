type StorageObjectSize = {
  objectKey: string;
  size: number;
};

function parsePositiveInteger(value: string | undefined, flag: string) {
  const parsed = value === undefined ? Number.NaN : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} harus bilangan bulat positif.`);
  }
  return parsed;
}

export function selectLargestStorageObjectsForTarget(
  objects: StorageObjectSize[],
  targetBytes: number,
) {
  if (!Number.isInteger(targetBytes) || targetBytes <= 0) {
    throw new Error("Target byte harus bilangan bulat positif.");
  }

  const sorted = objects
    .filter(
      (object) =>
        object.objectKey.trim() &&
        Number.isInteger(object.size) &&
        object.size > 0,
    )
    .sort(
      (left, right) =>
        right.size - left.size ||
        left.objectKey.localeCompare(right.objectKey),
    );
  const selected: StorageObjectSize[] = [];
  let selectedBytes = 0;

  for (const object of sorted) {
    if (selectedBytes >= targetBytes) break;
    selected.push(object);
    selectedBytes += object.size;
  }

  return { selected, selectedBytes };
}

export function parseStorageSourceCleanupOptions(args: string[]) {
  const normalizedArgs = args.filter((arg) => arg !== "--");
  const knownPrefixes = [
    "--target-bytes=",
    "--expected-files=",
    "--expected-bytes=",
  ];
  const unknownArgs = normalizedArgs.filter(
    (arg) =>
      arg !== "--apply" &&
      !knownPrefixes.some((prefix) => arg.startsWith(prefix)),
  );
  if (unknownArgs.length > 0) {
    throw new Error(`Argumen tidak dikenal: ${unknownArgs.join(", ")}`);
  }

  const readValue = (prefix: string) =>
    normalizedArgs.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const targetBytes = parsePositiveInteger(
    readValue("--target-bytes="),
    "--target-bytes",
  );
  const apply = normalizedArgs.includes("--apply");
  const rawExpectedFiles = readValue("--expected-files=");
  const rawExpectedBytes = readValue("--expected-bytes=");
  const expectedFiles =
    rawExpectedFiles === undefined
      ? null
      : parsePositiveInteger(rawExpectedFiles, "--expected-files");
  const expectedBytes =
    rawExpectedBytes === undefined
      ? null
      : parsePositiveInteger(rawExpectedBytes, "--expected-bytes");

  if (apply && (expectedFiles === null || expectedBytes === null)) {
    throw new Error(
      "--expected-files dan --expected-bytes wajib saat memakai --apply.",
    );
  }

  return {
    apply,
    targetBytes,
    expectedFiles,
    expectedBytes,
  };
}
