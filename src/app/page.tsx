import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="site-home">
      <header className="site-header site-wrap">
        <Link className="site-brand" href="/" aria-label="AI Food Diary 首頁">
          <span className="site-brand-symbol"><BrandMark /></span>
          <span>AI Food Diary</span>
        </Link>
        <nav className="site-header-nav" aria-label="網站導覽">
          <a href="#how-it-works">怎麼運作</a>
          <Link className="site-header-login" href="/login">登入或開始使用</Link>
        </nav>
      </header>

      <main>

      <section className="site-hero site-wrap" aria-labelledby="site-hero-title">
        <div className="site-hero-copy">
          <h1 id="site-hero-title">把每一餐，<br /><span>記成自己的節奏。</span></h1>
          <p className="site-hero-lead">拍下、描述，或手動輸入今天吃的東西。AI 幫你整理營養估算，最後由你確認，才成為正式紀錄。</p>
          <div className="site-hero-actions">
            <Link className="site-button site-button-primary" href="/login">開始記錄</Link>
            <a className="site-text-link" href="#how-it-works">了解記錄流程</a>
          </div>
          <p className="site-hero-footnote">每一次估算都可以檢查、調整，再決定是否儲存。</p>
        </div>

        <div className="site-hero-scene" aria-label="飲食記錄示意">
          <div className="site-journal">
            <div className="site-journal-header">
              <div className="site-journal-brand"><span className="site-journal-brand-mark"><BrandMark /></span> 我的飲食紀錄</div>
              <span className="site-journal-date">今天 · 午餐</span>
            </div>
            <div className="site-journal-body">
              <div className="site-journal-photo">
                <Image src="/images/meal-journal.jpg" alt="雞肉、糙米與蔬菜的餐點示意照片" width={1100} height={1100} sizes="(max-width: 620px) 100vw, (max-width: 900px) 70vw, 40vw" preload />
                <span className="site-photo-label">拍照記下這一餐</span>
              </div>
              <div className="site-journal-entry">
                <span className="site-entry-status"><span aria-hidden="true" /> AI 估算 · 待確認</span>
                <h2>雞肉與蔬菜<br />糙米餐盤</h2>
                <p>AI 先整理內容，你可以修正食物、份量與營養數值。</p>
                <div className="site-entry-calories"><strong>548</strong><span>kcal<br />估算熱量</span></div>
                <dl className="site-entry-macros">
                  <div><dt>蛋白質</dt><dd>36 g</dd></div>
                  <div><dt>脂肪</dt><dd>18 g</dd></div>
                  <div><dt>碳水</dt><dd>60 g</dd></div>
                </dl>
                <div className="site-entry-review"><span className="site-review-check" aria-hidden="true" /><span>確認後，才會儲存為正式紀錄</span></div>
              </div>
            </div>
          </div>
          <p className="site-scene-note">畫面與營養數值為示意，實際估算會依餐點而異。</p>
        </div>
      </section>

      <section className="site-process" id="how-it-works" aria-labelledby="site-process-title">
        <div className="site-wrap">
          <div className="site-process-intro">
            <h2 id="site-process-title">先看懂，<br />再決定要留下什麼。</h2>
            <p>記錄可以很簡單，也保留你需要的細節。從第一餐到長期回顧，都由你掌握。</p>
          </div>
          <div className="site-process-steps">
            <article><span>01</span><h3>用習慣的方式開始</h3><p>上傳餐點照片、輸入描述，或直接手動記錄。</p></article>
            <article><span>02</span><h3>把估算變成自己的紀錄</h3><p>檢查 AI 整理的食物與營養，修改後再確認儲存。</p></article>
            <article><span>03</span><h3>回看每天的節奏</h3><p>查看攝取摘要、飲水與歷史紀錄，理解下一步。</p></article>
          </div>
        </div>
      </section>

      <section className="site-close site-wrap" aria-labelledby="site-close-title">
        <div>
          <h2 id="site-close-title">從今天這一餐開始。</h2>
          <p>慢慢記，也能更清楚地認識自己的飲食。</p>
        </div>
        <Link className="site-button site-button-light" href="/login">開始使用</Link>
      </section>
      </main>

      <footer className="site-footer site-wrap"><span>AI Food Diary</span><span>理解每一餐，照自己的步調前進。</span></footer>
    </div>
  );
}
