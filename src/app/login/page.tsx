import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="glass iridescent w-full max-w-md rounded-[2rem] p-8">
        <h1 className="text-3xl font-black">登入</h1>
        <p className="mt-2 text-slate-600">回到你的 AI 飲食紀錄。</p>
        <AuthForm mode="login" turnstileSiteKey={turnstileSiteKey} />
        <p className="mt-6 text-sm text-slate-600">
          還沒有帳號？ <Link className="font-semibold text-emerald-700" href="/register">註冊</Link>
        </p>
      </div>
    </main>
  );
}
