import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl">
        <h1 className="text-3xl font-black">建立帳號</h1>
        <p className="mt-2 text-slate-600">開始用照片追蹤營養與熱量。</p>
        <AuthForm mode="register" />
        <p className="mt-6 text-sm text-slate-600">
          已經有帳號？ <Link className="font-semibold text-emerald-700" href="/login">登入</Link>
        </p>
      </div>
    </main>
  );
}
