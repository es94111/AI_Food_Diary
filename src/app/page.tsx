import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-emerald-700">AI Food Diary</p>
          <h1 className="text-5xl font-black leading-tight text-slate-950 md:text-7xl">
            拍下每一餐，讓 AI 幫你看懂營養。
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">
            上傳餐點照片，自動估算熱量、蛋白質、脂肪與碳水，並依據今日攝取提供下一餐建議與昨日總結。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="rounded-full bg-slate-950 px-6 py-3 font-semibold text-white" href="/login">
              登入開始使用
            </Link>
            <Link className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900" href="/register">
              建立帳號
            </Link>
          </div>
        </div>
        <div className="rounded-[2rem] border border-white/80 bg-white/80 p-6 shadow-2xl shadow-emerald-900/10 backdrop-blur">
          <div className="rounded-[1.5rem] bg-slate-950 p-6 text-white">
            <p className="text-sm text-emerald-200">今日攝取</p>
            <p className="mt-2 text-5xl font-black">1,420 kcal</p>
            <div className="mt-8 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-white/10 p-4"><p className="text-2xl font-bold">82g</p><p className="text-xs text-slate-300">蛋白質</p></div>
              <div className="rounded-2xl bg-white/10 p-4"><p className="text-2xl font-bold">45g</p><p className="text-xs text-slate-300">脂肪</p></div>
              <div className="rounded-2xl bg-white/10 p-4"><p className="text-2xl font-bold">160g</p><p className="text-xs text-slate-300">碳水</p></div>
            </div>
            <div className="mt-6 rounded-2xl bg-emerald-400 p-4 text-slate-950">
              <p className="font-bold">下一餐建議</p>
              <p className="mt-1 text-sm">補充高蛋白與蔬菜，避免再攝取高糖飲料。</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
