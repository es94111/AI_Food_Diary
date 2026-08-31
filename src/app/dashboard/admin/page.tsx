import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdminDataForm } from "./admin-data-form";

// Admin-only data management: decrypted export / re-encrypting import.
// The page-level redirect is defense-in-depth; the API routes also gate with
// requireAdmin (403) so a stale client cannot reach the endpoints either way.
export default async function AdminDataPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/dashboard");

  return (
    <>
      <header className="mt-6">
        <h1 className="text-4xl font-black tracking-tight">管理</h1>
        <p className="mt-1 text-sm text-stone-500">資料匯出與匯入（僅限管理員）</p>
      </header>
      <div className="mt-6">
        <AdminDataForm />
      </div>
    </>
  );
}