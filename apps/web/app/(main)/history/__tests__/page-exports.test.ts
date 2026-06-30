import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ALLOWED_APP_PAGE_EXPORTS = new Set([
  "default",
  "config",
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
  "generateStaticParams",
  "metadata",
  "generateMetadata",
  "viewport",
  "generateViewport",
]);

function getNamedExports(sourceText: string) {
  const sourceFile = ts.createSourceFile(
    "page.tsx",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const exports: string[] = [];

  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)
      : undefined;
    const hasExport = modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!hasExport) continue;

    const hasDefault = modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
    );
    if (hasDefault) {
      exports.push("default");
      continue;
    }

    if (ts.isFunctionDeclaration(statement) || ts.isVariableStatement(statement)) {
      if (ts.isFunctionDeclaration(statement)) {
        exports.push(statement.name?.text ?? "default");
        continue;
      }

      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) exports.push(declaration.name.text);
      }
    }
  }

  return exports.filter((name) => !ALLOWED_APP_PAGE_EXPORTS.has(name));
}

describe("history App Router page exports", () => {
  it("does not named-export testable components from page.tsx", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "app/(main)/history/page.tsx"),
      "utf8",
    );

    expect(getNamedExports(pageSource)).toEqual([]);
  });
});
