import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clientOptions = vi.hoisted(() => vi.fn());

vi.mock("../../../../packages/db/node_modules/@prisma/client", () => ({
  PrismaClient: class {
    constructor(options: { datasourceUrl?: string }) {
      clientOptions(options);
    }
    $on = vi.fn();
  },
  Prisma: {},
}));

async function configuredUrl(url: string): Promise<URL> {
  vi.stubEnv("DATABASE_URL", url);
  await import("../../../../packages/db/src/index");
  return new URL(clientOptions.mock.calls[0][0].datasourceUrl);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("prisma", undefined);
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Supabase database connection budget", () => {
  const pooledUrl =
    "postgresql://tester:example@aws-0-ap-southeast-1.pooler.supabase.com:6543/development";

  it("allows 15 seconds to establish a remote connection by default", async () => {
    const url = await configuredUrl(pooledUrl);
    expect(url.searchParams.get("connect_timeout")).toBe("15");
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("pgbouncer")).toBe("true");
  });

  it("adds the connection budget when TLS is already configured", async () => {
    const url = await configuredUrl(
      `${pooledUrl}?sslmode=verify-full&connection_limit=3&pool_timeout=30`,
    );
    expect(url.searchParams.get("connect_timeout")).toBe("15");
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(url.searchParams.get("connection_limit")).toBe("3");
    expect(url.searchParams.get("pool_timeout")).toBe("30");
  });

  it.each(["0", "5", "30"])(
    "preserves an explicitly configured connection timeout of %s seconds",
    async (timeout) => {
      const url = await configuredUrl(`${pooledUrl}?connect_timeout=${timeout}`);
      expect(url.searchParams.get("connect_timeout")).toBe(timeout);
    },
  );

  it("keeps the connection settings of other PostgreSQL providers", async () => {
    const original = "postgresql://tester:example@localhost:5432/development";
    const url = await configuredUrl(original);
    expect(url.toString()).toBe(original);
  });
});
