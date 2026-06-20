import { PrismaClient, Prisma } from "@prisma/client";

declare const process: {
  env: {
    NODE_ENV?: string;
    DATABASE_URL?: string;
    LOG_LEVEL?: string;
    DB_LOG_QUERIES?: string;
  };
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function normalizePooledPostgresUrl(url?: string) {
  if (!url) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol.startsWith("postgres")) {
      if (parsedUrl.port === "6543" && !parsedUrl.searchParams.has("pgbouncer")) {
        parsedUrl.searchParams.set("pgbouncer", "true");
      }

      if (
        parsedUrl.hostname.includes("supabase.com") &&
        !parsedUrl.searchParams.has("sslmode")
      ) {
        parsedUrl.searchParams.set("sslmode", "require");
      }

      return parsedUrl.toString();
    }
  } catch {
    return url;
  }

  return url;
}

type PrismaLogEvent = {
  level: "query" | "info" | "warn" | "error";
  payload: Record<string, unknown>;
};

function emitDbLog({ level, payload }: PrismaLogEvent) {
  const time = new Date().toISOString();
  const record = JSON.stringify({ time, level, name: "db", ...payload });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.log(record);
}

function createPrismaClient(): PrismaClient {
  const isDev = process.env.NODE_ENV !== "production";
  const wantQueries =
    process.env.DB_LOG_QUERIES === "1" ||
    process.env.LOG_LEVEL === "trace" ||
    process.env.LOG_LEVEL === "debug";

  const client = new PrismaClient({
    datasourceUrl: normalizePooledPostgresUrl(process.env.DATABASE_URL),
    log: [
      ...(wantQueries ? ([{ emit: "event", level: "query" }] as const) : []),
      { emit: "event", level: "info" },
      { emit: "event", level: "warn" },
      { emit: "event", level: "error" },
    ],
  });

  if (wantQueries) {
    client.$on("query", (e) => {
      emitDbLog({
        level: "query",
        payload: {
          msg: "db.query",
          query: e.query,
          params: e.params,
          durationMs: e.duration,
          target: e.target,
        },
      });
    });
  }

  client.$on("info", (e) => {
    emitDbLog({ level: "info", payload: { msg: "db.info", message: e.message, target: e.target } });
  });
  client.$on("warn", (e) => {
    emitDbLog({ level: "warn", payload: { msg: "db.warn", message: e.message, target: e.target } });
  });
  client.$on("error", (e) => {
    emitDbLog({ level: "error", payload: { msg: "db.error", message: e.message, target: e.target } });
  });

  if (isDev) {
    emitDbLog({ level: "info", payload: { msg: "db.client.created" } });
  }

  return client;
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export { Prisma, PrismaClient };
export * from "@prisma/client";
