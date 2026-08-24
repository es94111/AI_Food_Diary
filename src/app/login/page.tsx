import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="glass iridescent w-full max-w-md rounded-[2rem] p-8 text-center">
        <h1 className="text-3xl font-black">登入或註冊</h1>
        <p className="mt-2 text-stone-600">
          本服務僅支援 Google SSO。選擇 Google
          帳號即可登入，首次使用會自動建立帳號。
        </p>
        <GoogleSignInButton
          clientId={
            process.env.GOOGLE_CLIENT_ID ??
            process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
          }
        />
      </div>
    </main>
  );
}
