"use client";

import { useRouter } from "next/navigation";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return <button className={className || "rounded-full bg-white px-5 py-3 font-semibold shadow-sm"} onClick={logout} type="button">登出</button>;
}
