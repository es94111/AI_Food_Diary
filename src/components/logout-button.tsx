"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return <button className="rounded-full bg-white px-5 py-3 font-semibold shadow-sm" onClick={logout}>登出</button>;
}
