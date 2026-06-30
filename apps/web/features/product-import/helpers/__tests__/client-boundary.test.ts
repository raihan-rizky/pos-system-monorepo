import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function getImportSources(sourceText: string) {
  const sourceFile = ts.createSourceFile(
    "import-core.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  return sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text);
}

describe("client import helper boundary", () => {
  it("keeps product import-core free of server-only spreadsheet parsing", () => {
    const source = readFileSync(
      join(process.cwd(), "features/product-import/helpers/import-core.ts"),
      "utf8",
    );

    expect(getImportSources(source)).not.toContain(
      "@/lib/server/spreadsheet-parser",
    );
  });
});
