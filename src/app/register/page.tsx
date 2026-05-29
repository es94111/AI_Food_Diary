import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AuthForm } from "@/components/auth-form";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const userCount = await prisma.user.count();
  const isFirstUser = userCount === 0;

  let registrationOpen = true;
  if (!isFirstUser) {
    const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
    registrationOpen = config?.registrationOpen ?? true;
  }

  if (!registrationOpen) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 py-12">
        <div className="glass iridescent w-full max-w-md rounded-[2rem] p-8 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-stone-500">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <h1 className="mt-5 text-2xl font-black">目前未開放註冊</h1>
          <p className="mt-3 text-stone-600">此站台已關閉公開註冊，請聯絡管理員以取得帳號。</p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-full bg-stone-950 px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80"
          >
            前往登入
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="glass iridescent w-full max-w-md rounded-[2rem] p-8">
        <h1 className="text-3xl font-black">{isFirstUser ? "建立管理員帳號" : "建立帳號"}</h1>
        <p className="mt-2 text-stone-600">
          {isFirstUser ? "您將成為第一位使用者（管理員）。" : "開始用照片追蹤營養與熱量。"}
        </p>
        <AuthForm mode="register" />
        <p className="mt-6 text-sm text-stone-600">
          已經有帳號？ <Link className="font-semibold text-amber-700" href="/login">登入</Link>
        </p>
      </div>
    </main>
  );
}
