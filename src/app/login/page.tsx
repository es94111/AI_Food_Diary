import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentUser } from "@/lib/auth";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile-config";

// Only these in-app destinations may be a post-login target: the MCP consent page and the one-click
// import's authorize step (which sends the signed-in user on to NouriLedger).
const NEXT_PREFIXES = ["/oauth/authorize?", "/api/migration/nouriledger/authorize?"];

function safeNextPath(value: string | string[] | undefined): string {
  if (
    typeof value === "string" &&
    NEXT_PREFIXES.some((prefix) => value.startsWith(prefix)) &&
    !value.startsWith("//") &&
    value.length <= 8_192
  ) {
    return value;
  }
  return "/dashboard";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const nextPath = safeNextPath((await searchParams).next);
  const user = await getCurrentUser();
  if (user) redirect(nextPath);

  return (
    <div className="site-auth">
      <header className="site-header site-auth-header site-wrap">
        <Link className="site-brand" href="/" aria-label="AI Food Diary 首頁">
          <span className="site-brand-symbol"><BrandMark /></span>
          <span>AI Food Diary</span>
        </Link>
        <Link className="site-auth-back" href="/">返回首頁</Link>
      </header>
      <main className="site-auth-grid site-wrap">
        <section className="site-auth-story" aria-labelledby="site-auth-story-title">
          <div>
            <h1 id="site-auth-story-title">從今天這一餐，<br />開始更了解自己。</h1>
            <p>留下每一餐的內容，檢查 AI 的估算，再依自己的步調回看每天的飲食。</p>
          </div>
          <div className="site-auth-photo">
            <Image src="/images/meal-journal.jpg" alt="雞肉、糙米與蔬菜的餐點示意照片" width={1100} height={1100} sizes="(max-width: 900px) 0px, 50vw" loading="eager" />
            <span>一餐一餐，慢慢記下來。</span>
          </div>
        </section>
        <section className="site-auth-panel" aria-labelledby="site-auth-title">
          <span className="site-auth-panel-mark"><BrandMark /></span>
          <h2 id="site-auth-title">登入或註冊</h2>
          <p>使用 Google 帳號繼續。首次登入時會自動建立帳號，之後就能接著記錄。</p>
          <div className="site-auth-signin">
            <GoogleSignInButton
              clientId={process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}
              turnstileSiteKey={TURNSTILE_SITE_KEY}
              nextPath={nextPath}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
