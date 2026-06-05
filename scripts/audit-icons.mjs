import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps", "packages", "scripts"];
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".md",
  ".json",
  ".mjs",
]);

const checks = [
  {
    name: "inline-svg",
    pattern: /<svg\b/g,
    skip: (file) => file.includes(`${path.sep}public${path.sep}`),
  },
  {
    name: "emoji-icon",
    pattern: /[✅❌💰📱⚠️📦🖨️✏️🖼️⚙️↩️]|ðŸ|âœ|âš|â|â†/g,
  },
  {
    name: "non-lucide-icon-package",
    pattern:
      /react-icons|@heroicons|fontawesome|fortawesome|material-icons|mui\/icons|@mui\/icons|bootstrap-icons/g,
  },
];

function walk(dir) {
  const fullDir = path.join(ROOT, dir);
  const entries = readdirSync(fullDir);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(fullDir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (["node_modules", ".next", "dist", "build"].includes(entry)) continue;
      files.push(...walk(path.relative(ROOT, fullPath)));
    } else if (TEXT_EXTENSIONS.has(path.extname(entry))) {
      files.push(fullPath);
    }
  }

  return files;
}

const findings = [];

for (const file of SCAN_ROOTS.flatMap(walk)) {
  const rel = path.relative(ROOT, file);
  if (rel === path.join("scripts", "audit-icons.mjs")) continue;
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  for (const check of checks) {
    if (check.skip?.(file)) continue;

    for (let index = 0; index < lines.length; index += 1) {
      check.pattern.lastIndex = 0;
      if (check.pattern.test(lines[index])) {
        findings.push({
          check: check.name,
          file: rel,
          line: index + 1,
          text: lines[index].trim(),
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Icon audit failed:");
  for (const finding of findings) {
    console.error(
      `- [${finding.check}] ${finding.file}:${finding.line} ${finding.text}`,
    );
  }
  process.exit(1);
}

console.log("Icon audit passed.");
