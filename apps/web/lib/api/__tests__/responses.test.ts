import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  apiCollection,
  apiError,
  apiList,
  apiNoContent,
  apiValidationError,
  buildPaginationMeta,
  parsePagination,
} from "../responses";

describe("parsePagination", () => {
  it("uses defaults when params missing", () => {
    const result = parsePagination(new URLSearchParams());
    expect(result).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it("respects defaultLimit and maxLimit options", () => {
    const result = parsePagination(new URLSearchParams("limit=999"), {
      defaultLimit: 50,
      maxLimit: 200,
    });
    expect(result.limit).toBe(200);
  });

  it("clamps page to >= 1", () => {
    const result = parsePagination(new URLSearchParams("page=-3"));
    expect(result.page).toBe(1);
    expect(result.skip).toBe(0);
  });

  it("computes skip from page and limit", () => {
    const result = parsePagination(new URLSearchParams("page=4&limit=25"));
    expect(result).toEqual({ page: 4, limit: 25, skip: 75 });
  });

  it("falls back to defaultLimit on invalid input", () => {
    const result = parsePagination(new URLSearchParams("limit=abc"), {
      defaultLimit: 30,
    });
    expect(result.limit).toBe(30);
  });
});

describe("buildPaginationMeta", () => {
  it("computes totalPages and flags for first page", () => {
    expect(buildPaginationMeta(250, 1, 100)).toEqual({
      total: 250,
      page: 1,
      limit: 100,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it("computes flags for middle page", () => {
    const meta = buildPaginationMeta(250, 2, 100);
    expect(meta.hasNextPage).toBe(true);
    expect(meta.hasPreviousPage).toBe(true);
  });

  it("computes flags for last page", () => {
    const meta = buildPaginationMeta(250, 3, 100);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(true);
  });

  it("handles zero items", () => {
    expect(buildPaginationMeta(0, 1, 20)).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });
});

describe("apiList", () => {
  it("returns {data, pagination} envelope with default 200", async () => {
    const meta = buildPaginationMeta(2, 1, 20);
    const res = apiList([{ id: "a" }, { id: "b" }], meta);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: [{ id: "a" }, { id: "b" }], pagination: meta });
  });

  it("respects custom init", () => {
    const meta = buildPaginationMeta(0, 1, 20);
    const res = apiList([], meta, { status: 200, headers: { "X-Foo": "bar" } });
    expect(res.headers.get("X-Foo")).toBe("bar");
  });
});

describe("apiCollection", () => {
  it("wraps array in {data}", async () => {
    const res = apiCollection([{ id: "x" }]);
    const body = await res.json();
    expect(body).toEqual({ data: [{ id: "x" }] });
  });
});

describe("apiNoContent", () => {
  it("returns 204 with empty body", async () => {
    const res = apiNoContent();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });
});

describe("apiError", () => {
  it("returns {message} with status", async () => {
    const res = apiError("Not found", 404);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: "Not found" });
  });

  it("includes errors map when provided", async () => {
    const res = apiError("Validation error", 422, {
      errors: { name: ["Required"] },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      message: "Validation error",
      errors: { name: ["Required"] },
    });
  });

  it("includes code discriminator when provided", async () => {
    const res = apiError("Not found", 404, { code: "NotFound" });
    expect(await res.json()).toEqual({
      message: "Not found",
      code: "NotFound",
    });
  });
});

describe("apiValidationError", () => {
  it("returns 422 with code=ValidationError and fieldErrors from Zod flatten()", async () => {
    const schema = z.object({ name: z.string().min(1), age: z.number() });
    const result = schema.safeParse({ name: "", age: "not-a-number" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const res = apiValidationError(result.error);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toBe("Validation error");
    expect(body.code).toBe("ValidationError");
    expect(body.errors).toBeDefined();
    expect(body.errors.name).toBeDefined();
    expect(body.errors.age).toBeDefined();
  });

  it("accepts a custom message", async () => {
    const schema = z.object({ id: z.string() });
    const result = schema.safeParse({});
    if (result.success) return;

    const res = apiValidationError(result.error, "Bad input");
    const body = await res.json();
    expect(body.message).toBe("Bad input");
  });
});
