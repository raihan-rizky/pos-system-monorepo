import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function main() {
  const [releaseArg, outputArg, commit, target] = process.argv.slice(2);
  if (!releaseArg || !outputArg || !/^[0-9a-f]{40}$/.test(commit ?? "")) {
    throw new Error("A release directory, output directory, and full commit SHA are required");
  }
  if (!["dev", "prod"].includes(target)) {
    throw new Error("Target must be dev or prod");
  }

  const release = resolve(releaseArg);
  const output = resolve(outputArg);
  if (basename(release) !== "runtime") throw new Error("Release directory must be named runtime");
  const outputWithinRelease = relative(release, output);
  if (outputWithinRelease === "" || (!isAbsolute(outputWithinRelease) && outputWithinRelease !== ".." && !outputWithinRelease.startsWith(`..${sep}`))) {
    throw new Error("Output directory must be outside the release directory");
  }
  const buildIdPath = join(release, "apps", "web", ".next", "BUILD_ID");
  if (!existsSync(buildIdPath)) throw new Error("BUILD_ID is missing");
  const buildId = readFileSync(buildIdPath, "utf8").trim();
  if (!buildId) throw new Error("BUILD_ID is empty");

  mkdirSync(output, { recursive: true });
  const metadata = {
    checkedOutSha: commit,
    requestedRef: process.env.VPS_BUILD_REF ?? commit,
    buildId,
    target,
    sourceRepository: process.env.GITHUB_REPOSITORY ?? "",
    sourceBranch: process.env.GITHUB_REF_NAME ?? "",
    runId: process.env.GITHUB_RUN_ID ?? "",
    schemaSha256: await sha256(join(release, "packages", "db", "prisma", "schema.prisma")),
    publicR2BaseUrl: process.env.R2_PUBLIC_BASE_URL ?? "",
    publicAuthUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    publicAnonKeySha256: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? createHash("sha256").update(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).digest("hex")
      : "",
    createdAt: new Date().toISOString(),
  };
  const metadataPath = join(output, "metadata.json");
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  const archiveName = `pos-web-runtime-${commit}.tar.gz`;
  const archivePath = join(output, archiveName);
  const tar = spawnSync("tar", [
    "-czf", archivePath,
    "--exclude=runtime/apps/web/.next/cache",
    "--exclude=.env",
    "--exclude=.env.*",
    "--exclude=*.log",
    "-C", dirname(release), "runtime",
  ], { encoding: "utf8" });
  if (tar.error || tar.status !== 0) throw new Error(`tar failed: ${tar.error?.message ?? tar.stderr}`);

  const sums = `${await sha256(archivePath)}  ${archiveName}\n${await sha256(metadataPath)}  metadata.json\n`;
  writeFileSync(join(output, "sha256sums.txt"), sums);
  process.stdout.write(`Created ${archiveName}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
