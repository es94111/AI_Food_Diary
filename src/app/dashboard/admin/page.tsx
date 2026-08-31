import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdminControlPanel } from "./admin-control-panel";
import { AdminDataForm } from "./admin-data-form";

export default async function AdminDataPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/dashboard");

  return (
    <>
      <header className="mt-6">
        <h1 className="text-4xl font-black tracking-tight">管理</h1>
        <p className="mt-1 text-sm text-stone-500">註冊、使用者與資料管理（僅限管理員）</p>
      </header>
      <div className="mt-6 space-y-6">
        <AdminControlPanel currentUserId={user.id} />
        <AdminDataForm />
      </div>
    </>
  );
}
