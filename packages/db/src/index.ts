import { PrismaClient } from "@prisma/client";

declare const process: {
  env: {
    NODE_ENV?: string;
  };
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export { PrismaClient };
export * from "@prisma/client";
