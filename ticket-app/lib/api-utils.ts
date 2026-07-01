/**
 * Shared JSON response helpers for API routes.
 * Uses NextResponse for proper Next.js header handling.
 */
import { NextResponse } from "next/server";

export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data } satisfies ApiSuccessResponse<T>, { status });
}

export function err(message: string, status = 400, code?: string): NextResponse {
  const body: ApiErrorResponse = { error: message };
  if (code) body.code = code;
  return NextResponse.json(body, { status });
}