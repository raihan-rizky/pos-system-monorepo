import { describe, expect, it } from "vitest";
import {
  computeNetExpense,
  bucketExpensesByDay,
  bucketExpensesByCategory,
  bucketTransactionsByDay,
  buildKeuanganMonthRange,
  validateExpensePayload,
} from "../keuangan-core";

describe("computeNetExpense", () => {
  it("subtracts changeAmount from amount", () => {
    expect(computeNetExpense(100_000, 12_500)).toBe(87_500);
  });

  it("treats zero changeAmount as no change", () => {
    expect(computeNetExpense(50_000, 0)).toBe(50_000);
  });

  it("accepts Decimal-like string inputs (Prisma serializes Decimal as string)", () => {
    expect(computeNetExpense("100000.00", "12500.00")).toBe(87_500);
  });

  it("returns 0 when both inputs are zero", () => {
    expect(computeNetExpense(0, 0)).toBe(0);
  });

  it("throws when amount is negative", () => {
    expect(() => computeNetExpense(-1, 0)).toThrow();
  });

  it("throws when changeAmount is negative", () => {
    expect(() => computeNetExpense(100, -1)).toThrow();
  });

  it("throws when changeAmount exceeds amount", () => {
    expect(() => computeNetExpense(100, 101)).toThrow();
  });
});

describe("bucketExpensesByDay (Asia/Jakarta)", () => {
  it("groups expenses by Jakarta calendar day, summing net amount", () => {
    const rows = [
      {
        occurredAt: new Date("2026-05-20T01:00:00.000Z"), // 2026-05-20 08:00 WIB
        amount: 100_000,
        changeAmount: 0,
        category: "SUPPLIES" as const,
      },
      {
        occurredAt: new Date("2026-05-20T10:00:00.000Z"), // 2026-05-20 17:00 WIB
        amount: 50_000,
        changeAmount: 5_000,
        category: "BEVERAGES" as const,
      },
      {
        occurredAt: new Date("2026-05-21T03:00:00.000Z"), // 2026-05-21 10:00 WIB
        amount: 30_000,
        changeAmount: 0,
        category: "SUPPLIES" as const,
      },
    ];

    const result = bucketExpensesByDay(rows);

    expect(result).toEqual([
      {
        date: "2026-05-20",
        total: 145_000, // 100k + (50k - 5k)
        byCategory: { SUPPLIES: 100_000, BEVERAGES: 45_000 },
      },
      {
        date: "2026-05-21",
        total: 30_000,
        byCategory: { SUPPLIES: 30_000 },
      },
    ]);
  });

  it("buckets a 23:30 WIB entry into its Jakarta day, not the UTC day", () => {
    // 2026-05-31 23:30 WIB == 2026-05-31T16:30:00Z
    const rows = [
      {
        occurredAt: new Date("2026-05-31T16:30:00.000Z"),
        amount: 100,
        changeAmount: 0,
        category: "OTHER" as const,
      },
    ];
    const result = bucketExpensesByDay(rows);
    expect(result[0]?.date).toBe("2026-05-31");
  });

  it("buckets a 00:30 WIB entry into the new Jakarta day", () => {
    // 2026-06-01 00:30 WIB == 2026-05-31T17:30:00Z
    const rows = [
      {
        occurredAt: new Date("2026-05-31T17:30:00.000Z"),
        amount: 100,
        changeAmount: 0,
        category: "OTHER" as const,
      },
    ];
    const result = bucketExpensesByDay(rows);
    expect(result[0]?.date).toBe("2026-06-01");
  });

  it("returns empty array for empty input", () => {
    expect(bucketExpensesByDay([])).toEqual([]);
  });
});

describe("bucketExpensesByCategory", () => {
  it("totals net expense per category, sorted desc", () => {
    const rows = [
      { amount: 100_000, changeAmount: 0, category: "SUPPLIES" as const },
      { amount: 50_000, changeAmount: 0, category: "UTILITIES" as const },
      { amount: 30_000, changeAmount: 5_000, category: "SUPPLIES" as const },
    ];

    expect(bucketExpensesByCategory(rows)).toEqual([
      { category: "SUPPLIES", total: 125_000 },
      { category: "UTILITIES", total: 50_000 },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(bucketExpensesByCategory([])).toEqual([]);
  });
});

describe("bucketTransactionsByDay (Pemasukan)", () => {
  it("groups sales by Jakarta calendar day, summing total and counting transactions", () => {
    const rows = [
      {
        createdAt: new Date("2026-05-20T01:00:00.000Z"), // 08:00 WIB
        total: 100_000,
      },
      {
        createdAt: new Date("2026-05-20T10:00:00.000Z"), // 17:00 WIB
        total: 250_000,
      },
      {
        createdAt: new Date("2026-05-21T03:00:00.000Z"), // 10:00 WIB
        total: 50_000,
      },
    ];

    expect(bucketTransactionsByDay(rows)).toEqual([
      { date: "2026-05-20", total: 350_000, count: 2 },
      { date: "2026-05-21", total: 50_000, count: 1 },
    ]);
  });

  it("accepts string totals (Decimal serialization)", () => {
    const rows = [
      { createdAt: new Date("2026-05-20T01:00:00.000Z"), total: "100000.50" },
    ];
    expect(bucketTransactionsByDay(rows)).toEqual([
      { date: "2026-05-20", total: 100_000.5, count: 1 },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(bucketTransactionsByDay([])).toEqual([]);
  });
});

describe("buildKeuanganMonthRange", () => {
  it("returns first-of-month and first-of-next-month UTC bounds for an Asia/Jakarta month", () => {
    const range = buildKeuanganMonthRange("2026-05");

    // 2026-05-01 00:00 WIB == 2026-04-30T17:00:00Z
    expect(range.start.toISOString()).toBe("2026-04-30T17:00:00.000Z");
    // 2026-06-01 00:00 WIB == 2026-05-31T17:00:00Z
    expect(range.end.toISOString()).toBe("2026-05-31T17:00:00.000Z");
  });

  it("rejects invalid month strings", () => {
    expect(() => buildKeuanganMonthRange("not-a-month")).toThrow();
    expect(() => buildKeuanganMonthRange("2026-13")).toThrow();
    expect(() => buildKeuanganMonthRange("2026-00")).toThrow();
  });
});

describe("validateExpensePayload", () => {
  const validBase = {
    applicantName: "Pak Budi",
    category: "SUPPLIES" as const,
    amount: 100_000,
    changeAmount: 0,
    occurredAt: "2026-05-20",
  };

  it("accepts a valid payload", () => {
    const result = validateExpensePayload(validBase, {
      now: new Date("2026-05-20T10:00:00.000Z"),
    });
    expect(result.success).toBe(true);
  });

  it("rejects amount <= 0", () => {
    expect(
      validateExpensePayload({ ...validBase, amount: 0 }, {
        now: new Date("2026-05-20T10:00:00.000Z"),
      }).success,
    ).toBe(false);
    expect(
      validateExpensePayload({ ...validBase, amount: -1 }, {
        now: new Date("2026-05-20T10:00:00.000Z"),
      }).success,
    ).toBe(false);
  });

  it("rejects changeAmount > amount", () => {
    const result = validateExpensePayload(
      { ...validBase, amount: 100, changeAmount: 101 },
      { now: new Date("2026-05-20T10:00:00.000Z") },
    );
    expect(result.success).toBe(false);
  });

  it("rejects occurredAt in the future (Asia/Jakarta)", () => {
    const result = validateExpensePayload(
      { ...validBase, occurredAt: "2026-05-21" },
      { now: new Date("2026-05-20T10:00:00.000Z") },
    );
    expect(result.success).toBe(false);
  });

  it("rejects occurredAt more than 5 years ago", () => {
    const result = validateExpensePayload(
      { ...validBase, occurredAt: "2021-05-19" },
      { now: new Date("2026-05-20T10:00:00.000Z") },
    );
    expect(result.success).toBe(false);
  });

  it("accepts occurredAt exactly 5 years ago", () => {
    const result = validateExpensePayload(
      { ...validBase, occurredAt: "2021-05-20" },
      { now: new Date("2026-05-20T10:00:00.000Z") },
    );
    expect(result.success).toBe(true);
  });

  it("rejects empty applicantName", () => {
    expect(
      validateExpensePayload({ ...validBase, applicantName: "" }, {
        now: new Date("2026-05-20T10:00:00.000Z"),
      }).success,
    ).toBe(false);
  });

  it("rejects applicantName longer than 100 chars", () => {
    expect(
      validateExpensePayload(
        { ...validBase, applicantName: "a".repeat(101) },
        { now: new Date("2026-05-20T10:00:00.000Z") },
      ).success,
    ).toBe(false);
  });

  it("rejects description longer than 500 chars", () => {
    expect(
      validateExpensePayload(
        { ...validBase, description: "x".repeat(501) },
        { now: new Date("2026-05-20T10:00:00.000Z") },
      ).success,
    ).toBe(false);
  });

  it("rejects invalid category", () => {
    expect(
      validateExpensePayload({ ...validBase, category: "BOGUS" as never }, {
        now: new Date("2026-05-20T10:00:00.000Z"),
      }).success,
    ).toBe(false);
  });
});
