import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "features/suppliers/components/SupplierPageShell.tsx"),
  "utf8",
);

describe("Supplier page responsive layout", () => {
  it("uses a compact two-column KPI layout on mobile", () => {
    expect(source).toContain('className="grid grid-cols-2 gap-3 md:grid-cols-4"');
    expect(source).toContain(
      "break-words text-base font-black text-slate-950 sm:text-lg",
    );
  });

  it("keeps the supplier tabs easy to swipe on narrow screens", () => {
    expect(source).toContain("snap-x snap-mandatory");
    expect(source).toContain("snap-start");
    expect(source).toContain('role="tablist"');
  });

  it("stacks card navigation and exposes full-width mobile actions", () => {
    expect(source).toContain(
      "flex flex-col items-stretch gap-3 border-t border-slate-100 pt-3 sm:flex-row",
    );
    expect(source).toContain(
      "grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap",
    );
    expect(source).toContain('className="w-full sm:w-auto"');
  });
});
