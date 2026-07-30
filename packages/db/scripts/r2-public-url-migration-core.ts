export type R2PublicUrlMigrationOptions = {
  apply: boolean;
  expectedCount: number | null;
  fromBaseUrl: string;
  toBaseUrl: string;
};

export type ProductImageUrlSample = {
  id: string;
  name: string;
  imageUrl: string;
};

export type R2PublicUrlMigrationRepository = {
  countByPrefix(prefix: string): Promise<number>;
  sampleByPrefix(
    prefix: string,
    limit: number,
  ): Promise<ProductImageUrlSample[]>;
  replacePrefix(fromPrefix: string, toPrefix: string): Promise<number>;
};

function readOption(args: string[], name: string) {
  const prefix = `--${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  return value?.trim() || null;
}

function normalizeBaseUrl(value: string, optionName: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`--${optionName} harus berupa URL HTTPS yang valid.`);
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`--${optionName} harus berupa URL HTTPS yang valid.`);
  }

  return url.toString().replace(/\/+$/, "");
}

export function parseR2PublicUrlMigrationOptions(
  args: string[],
): R2PublicUrlMigrationOptions {
  const unknownArgument = args.find(
    (arg) =>
      arg !== "--" &&
      arg !== "--apply" &&
      !arg.startsWith("--from=") &&
      !arg.startsWith("--to=") &&
      !arg.startsWith("--expected-count="),
  );
  if (unknownArgument) {
    throw new Error(`Argumen tidak dikenal: ${unknownArgument}`);
  }

  const apply = args.includes("--apply");
  const fromValue = readOption(args, "from");
  const toValue = readOption(args, "to");
  const expectedCountValue = readOption(args, "expected-count");

  if (!fromValue || !toValue) {
    throw new Error("--from dan --to wajib disertakan.");
  }

  const fromBaseUrl = normalizeBaseUrl(fromValue, "from");
  const toBaseUrl = normalizeBaseUrl(toValue, "to");
  if (fromBaseUrl === toBaseUrl) {
    throw new Error("--from dan --to tidak boleh sama.");
  }

  let expectedCount: number | null = null;
  if (expectedCountValue !== null) {
    expectedCount = Number(expectedCountValue);
    if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) {
      throw new Error("--expected-count harus berupa bilangan bulat non-negatif.");
    }
  }
  if (apply && expectedCount === null) {
    throw new Error("--expected-count wajib disertakan bersama --apply.");
  }

  return {
    apply,
    expectedCount,
    fromBaseUrl,
    toBaseUrl,
  };
}

export function rewriteR2PublicUrl(
  value: string,
  fromBaseUrl: string,
  toBaseUrl: string,
): string | null {
  const fromPrefix = `${fromBaseUrl}/`;
  if (!value.startsWith(fromPrefix)) return null;
  return `${toBaseUrl}/${value.slice(fromPrefix.length)}`;
}

export async function runR2PublicUrlMigration(
  options: R2PublicUrlMigrationOptions,
  repository: R2PublicUrlMigrationRepository,
) {
  const fromPrefix = `${options.fromBaseUrl}/`;
  const toPrefix = `${options.toBaseUrl}/`;
  const matched = await repository.countByPrefix(fromPrefix);
  const sampleRows = await repository.sampleByPrefix(fromPrefix, 10);
  const sample = sampleRows.map((row) => ({
    id: row.id,
    name: row.name,
    before: row.imageUrl,
    after:
      rewriteR2PublicUrl(
        row.imageUrl,
        options.fromBaseUrl,
        options.toBaseUrl,
      ) ?? row.imageUrl,
  }));

  if (!options.apply) {
    return { mode: "dry-run" as const, matched, updated: 0, sample };
  }

  if (matched !== options.expectedCount) {
    throw new Error(
      `Jumlah row berubah: expected=${options.expectedCount}, ditemukan=${matched}. Jalankan dry-run ulang.`,
    );
  }

  const updated = await repository.replacePrefix(fromPrefix, toPrefix);
  if (updated !== matched) {
    throw new Error(
      `Verifikasi update gagal: matched=${matched}, updated=${updated}.`,
    );
  }

  return { mode: "apply" as const, matched, updated, sample };
}
