// ============================================================
// Canonical API response builders for app/api/**/route.ts
// ============================================================
//
// All routes under apps/web/app/api use these helpers so the
// wire contract is consistent. See plans/woolly-watching-bee.md
// for the canonical shapes.
// ============================================================

import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ListResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface ErrorResponse {
  message: string;
  code?: ApiErrorCode;
  errors?: Record<string, string[]>;
}

export type ApiErrorCode =
  | "ValidationError"
  | "NotFound"
  | "Conflict"
  | "Unauthorized"
  | "Forbidden"
  | "PayloadTooLarge"
  | "UnsupportedMediaType"
  | "ServiceUnavailable"
  | "InternalError";

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface ParsePaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

export function parsePagination(
  searchParams: URLSearchParams,
  options: ParsePaginationOptions = {},
): PaginationParams {
  const { defaultLimit = 20, maxLimit = 100 } = options;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const rawLimit = parseInt(
    searchParams.get("limit") || String(defaultLimit),
    10,
  );
  const limit = Math.max(1, Math.min(maxLimit, rawLimit || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function apiList<T>(
  data: T[],
  pagination: PaginationMeta,
  init?: ResponseInit,
): NextResponse<ListResponse<T>> {
  return NextResponse.json({ data, pagination }, init);
}

export function apiCollection<T>(
  data: T[],
  init?: ResponseInit,
): NextResponse<{ data: T[] }> {
  return NextResponse.json({ data }, init);
}

export function apiNoContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function apiError(
  message: string,
  status: number,
  options?: {
    code?: ApiErrorCode;
    errors?: Record<string, string[]>;
    extra?: Record<string, unknown>;
  },
): NextResponse<ErrorResponse> {
  const body: ErrorResponse & Record<string, unknown> = { message };
  if (options?.code) body.code = options.code;
  if (options?.errors) body.errors = options.errors;
  if (options?.extra) Object.assign(body, options.extra);
  return NextResponse.json(body, { status });
}

export function apiValidationError(
  zodError: ZodError,
  message = "Validation error",
): NextResponse<ErrorResponse> {
  const flattened = zodError.flatten();
  return apiError(message, 422, {
    code: "ValidationError",
    errors: flattened.fieldErrors as Record<string, string[]>,
  });
}
