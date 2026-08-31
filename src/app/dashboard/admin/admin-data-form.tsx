"use client";

import { useRef, useState } from "react";

// Admin data export/import form. Export fetches the decrypted full-database
// JSON as a Blob download (so failures surface as a message instead of a
// navigation); import posts multipart form data and renders the per-table
// report. The export file contains every user's data in plaintext — the
// warning copy below is not optional decoration.

type TableReport = {
  table: string;
  total: number;
  imported: number;
  skippedExisting: number;
  failed: number;
  errors: string[];
};

type ImportReport = {
  ok: boolean;
  mode: string;
  startedAt: string;
  finishedAt: string;
  tables: TableReport[];
};

export function AdminDataForm() {
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"skip-existing" | "overwrite">("skip-existing");
  const [confirmedBackup, setConfirmedBackup] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExporting(true);
    setExportMessage(null);
    try {
      const res = await fetch("/api/admin/data/export");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `匯出失敗（HTTP ${res.status}）`);
      }
      // Attachment responses carry the filename in Content-Disposition.
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match?.[1] ?? "ai-food-diary-export.json";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportMessage(`已匯出 ${filename}`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "匯出失敗，請稍後再試。");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setImportMessage("請先選擇匯入檔案。");
      return;
    }
    if (mode === "overwrite" && !confirmedBackup) {
      setImportMessage("覆寫模式需先勾選「我已備份資料庫」。");
      return;
    }
    setImporting(true);
    setImportMessage(null);
    setReport(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      if (mode === "overwrite" && confirmedBackup) form.append("confirm", "true");
      const res = await fetch("/api/admin/data/import", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as ImportReport | { error?: string } | null;
      if (body && "tables" in body) {
        setReport(body);
        setImportMessage(body.ok ? "匯入完成。" : "匯入部分失敗，請檢查下方報告。");
      } else {
        setImportMessage((body as { error?: string } | null)?.error ?? `匯入失敗（HTTP ${res.status}）`);
      }
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : "匯入失敗，請稍後再試。");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass glass-lift rounded-[2rem] p-6">
        <h2 className="text-xl font-black">匯出（解密）</h2>
        <p className="mt-2 text-sm text-stone-500">
          下載全部使用者的資料（JSON，明文）。不含圖片檔案本體（照片保留在物件儲存）、不含密碼雜湊與健康連線權杖；
          但<strong className="text-red-600">包含各使用者的 AI API 金鑰明文</strong>，請妥善保管下載的檔案。
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {exporting ? "匯出中…" : "下載匯出檔"}
          </button>
          {exportMessage ? <span className="text-sm text-stone-600">{exportMessage}</span> : null}
        </div>
      </div>

      <div className="glass glass-lift rounded-[2rem] p-6">
        <h2 className="text-xl font-black">匯入（重新加密）</h2>
        <p className="mt-2 text-sm text-stone-500">
          上傳匯出檔，系統會以目前使用的加密金鑰重新加密後寫回。「略過已存在資料」不會更動任何既有資料；
          「覆寫已存在資料」會以檔案內容更新同 id／同鍵值的資料，<strong className="text-red-600">請務必先備份資料庫</strong>。
          匯入不會刪除檔案中沒有的資料；照片依 S3 金鑰對應，若匯入到不同儲存空間，照片連結會失效。
        </p>
        <form className="mt-4 space-y-4" onSubmit={handleImport}>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="block w-full text-sm text-stone-700"
            disabled={importing}
          />
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="import-mode"
                checked={mode === "skip-existing"}
                onChange={() => setMode("skip-existing")}
                disabled={importing}
              />
              略過已存在的資料（安全）
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="import-mode"
                checked={mode === "overwrite"}
                onChange={() => setMode("overwrite")}
                disabled={importing}
              />
              覆寫已存在的資料（需確認）
            </label>
          </div>
          {mode === "overwrite" ? (
            <label className="flex items-center gap-2 text-sm text-red-700">
              <input
                type="checkbox"
                checked={confirmedBackup}
                onChange={(e) => setConfirmedBackup(e.target.checked)}
                disabled={importing}
              />
              我已備份資料庫，確認覆寫
            </label>
          ) : null}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={importing || (mode === "overwrite" && !confirmedBackup)}
              className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {importing ? "匯入中…" : "開始匯入"}
            </button>
            {importMessage ? <span className="text-sm text-stone-600">{importMessage}</span> : null}
          </div>
        </form>

        {report ? (
          <div className="mt-5 space-y-3">
            {report.tables.map((t) => (
              <div key={t.table} className="rounded-2xl border border-stone-200 p-4 text-sm">
                <div className="font-bold">{t.table}</div>
                <div className="mt-1 text-stone-600">
                  共 {t.total} 筆 · 匯入 {t.imported} · 略過 {t.skippedExisting} ·{" "}
                  <span className={t.failed > 0 ? "text-red-600 font-bold" : ""}>失敗 {t.failed}</span>
                </div>
                {t.errors.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-red-600">
                    {t.errors.slice(0, 20).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {t.errors.length > 20 ? <li>… 其餘 {t.errors.length - 20} 筆錯誤省略</li> : null}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}