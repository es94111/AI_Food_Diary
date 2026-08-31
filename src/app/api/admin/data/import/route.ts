import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiRoute, HttpError } from "@/lib/http";
import { applyImport, ImportValidationError } from "@/lib/admin-export";
import { enforceAdminDataImportRateLimit } from "@/lib/rate-limit";

// Admin full-database import: accepts an export envelope, re-encrypts every
// sensitive column under the current active key, and upserts per table in FK
// order. skip-existing (default) is non-destructive; overwrite requires an
// explicit confirm flag — mirrored after the DB_BACKUP_CONFIRMED=yes gate in
// scripts/encryption-migration.ts.
const MAX_IMPORT_BYTES = 50 * 1024 * 1024; // 50 MB

type ParsedInput = { raw: string; mode: "skip-existing" | "overwrite" };

export const POST = apiRoute(async (request: Request) => {
  const admin = await requireAdmin();
  const limited = await enforceAdminDataImportRateLimit(admin.id);
  if (limited) return limited;

  const contentType = request.headers.get("content-type") ?? "";
  let raw: string;
  let mode: ParsedInput["mode"];
  let confirm: boolean;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new HttpError(400, "BAD_REQUEST", "請附加匯入檔案。");
    }
    if (file.size > MAX_IMPORT_BYTES) {
      throw new HttpError(400, "BAD_REQUEST", `檔案過大（上限 ${MAX_IMPORT_BYTES / (1024 * 1024)} MB）。`);
    }
    raw = await file.text();
    mode = form.get("mode") === "overwrite" ? "overwrite" : "skip-existing";
    confirm = form.get("confirm") === "true";
  } else {
    raw = await request.text();
    if (raw.length > MAX_IMPORT_BYTES) {
      throw new HttpError(400, "BAD_REQUEST", `請求主體過大（上限 ${MAX_IMPORT_BYTES / (1024 * 1024)} MB）。`);
    }
    // Raw-JSON callers hint mode/confirm via headers; the body stays purely the
    // export envelope so round-tripping a file works byte-for-byte.
    const headerMode = request.headers.get("x-import-mode");
    mode = headerMode === "overwrite" ? "overwrite" : "skip-existing";
    confirm = request.headers.get("x-import-confirm") === "true";
  }

  if (mode === "overwrite" && !confirm) {
    throw new HttpError(
      400,
      "CONFIRMATION_REQUIRED",
      "覆寫模式必須明確確認（confirm=true），並先備份資料庫。"
    );
  }

  try {
    const report = await applyImport(raw, { mode });
    // 207 when anything failed (per-table report still meaningful); 200 clean.
    return NextResponse.json(report, { status: report.ok ? 200 : 207 });
  } catch (err) {
    if (err instanceof ImportValidationError) {
      throw new HttpError(400, "IMPORT_INVALID", err.message);
    }
    throw err;
  }
});