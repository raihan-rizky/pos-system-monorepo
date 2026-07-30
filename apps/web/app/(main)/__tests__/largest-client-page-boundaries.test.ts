import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = [
  {
    route: "products",
    clientModule: "ProductsClientPage",
  },
  {
    route: "history",
    clientModule: "HistoryClientPage",
  },
  {
    route: "customers",
    clientModule: "CustomersClientPage",
  },
] as const;

describe.each(ROUTES)(
  "$route server/client page boundary",
  ({ route, clientModule }) => {
    const routeDirectory = join(process.cwd(), "app/(main)", route);
    const pagePath = join(routeDirectory, "page.tsx");
    const clientPath = join(routeDirectory, `${clientModule}.tsx`);

    it("keeps page.tsx server-only and delegates interactive UI", () => {
      expect(
        existsSync(clientPath),
        `${clientModule}.tsx must contain the interactive page implementation`,
      ).toBe(true);

      const pageSource = readFileSync(pagePath, "utf8");
      const clientSource = readFileSync(clientPath, "utf8");

      expect(pageSource).not.toMatch(/^\s*["']use client["'];?/);
      expect(pageSource).toContain(
        `import ${clientModule} from "./${clientModule}";`,
      );
      expect(pageSource).toContain(`<${clientModule} />`);
      expect(clientSource).toMatch(/^\s*["']use client["'];?/);
      expect(clientSource).toContain(
        `export default function ${clientModule}()`,
      );
    });
  },
);
