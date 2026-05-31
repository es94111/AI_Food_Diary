import { NextResponse } from "next/server";
import { ZodError } from "zod";

// A thrown error that carries the HTTP status to return. `message` stays a
// short machine string (e.g. "Unauthorized") so existing `message === ...`
// checks keep working; `publicMessage` is what we surface to the client.
export class HttpError extends Error {
  readonly status: number;
  readonly publicMessage: string;

  constructor(status: number, message: string, publicMessage?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.publicMessage = publicMessage ?? message;
  }
}

export function unauthorized(publicMessage = "請先登入後再操作。") {
  return new HttpError(401, "Unauthorized", publicMessage);
}

export function forbidden(publicMessage = "權限不足。") {
  return new HttpError(403, "Forbidden", publicMessage);
}

// Translates a thrown error into a JSON response. Known errors map to their
// status; everything else becomes a 500 without leaking internals.
export function apiError(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.publicMessage }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "輸入格式不正確。" }, { status: 400 });
  }
  console.error("Unhandled API error", error);
  return NextResponse.json({ error: "伺服器發生錯誤，請稍後再試。" }, { status: 500 });
}

// Wraps a route handler so any thrown HttpError/ZodError becomes the right
// status instead of an opaque 500. Works for any handler signature
// (no-arg, (request), (request, context), ...).
export function apiRoute<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return apiError(error);
    }
  };
}
