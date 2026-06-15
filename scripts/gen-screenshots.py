"""
Generates mockup screenshots for README.md using Python Playwright.
Run: python scripts/gen-screenshots.py
"""
import os
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), "../docs/screenshots")
os.makedirs(OUT, exist_ok=True)

WEB_DASHBOARD = """<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1280">
<title>AI Food Diary — Web</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{font-family:'Segoe UI',system-ui,sans-serif;}</style>
</head>
<body class="bg-stone-100 min-h-screen">
<nav class="bg-white border-b border-stone-200 px-6 py-3 flex items-center justify-between">
  <div class="flex items-center gap-3">
    <span class="text-2xl">🍽️</span>
    <span class="font-black text-stone-800 text-lg">AI Food Diary</span>
  </div>
  <div class="flex items-center gap-2 text-sm font-semibold text-stone-500">
    <a class="px-3 py-1.5 rounded-xl bg-stone-100 text-stone-700">飲食</a>
    <a class="px-3 py-1.5 rounded-xl">健康</a>
    <a class="px-3 py-1.5 rounded-xl">設定</a>
    <div class="w-8 h-8 rounded-full bg-amber-700 text-white flex items-center justify-center text-xs font-bold ml-2">洪</div>
  </div>
</nav>
<main class="max-w-4xl mx-auto px-4 py-6 space-y-5">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-black text-stone-800">今日飲食</h1>
    <div class="flex items-center gap-2 text-sm">
      <button class="px-3 py-1 rounded-lg bg-white border border-stone-200 text-stone-500">‹</button>
      <span class="font-semibold text-stone-700">2026年6月15日（日）</span>
      <button class="px-3 py-1 rounded-lg bg-white border border-stone-200 text-stone-500">›</button>
    </div>
  </div>
  <div class="grid grid-cols-4 gap-3">
    <div class="col-span-2 bg-amber-700 rounded-3xl p-5 text-white">
      <p class="text-amber-200 text-sm font-semibold">今日攝取</p>
      <p class="text-5xl font-black mt-1">1,842</p>
      <p class="text-amber-300 text-sm mt-1">/ 2,000 kcal 目標</p>
      <div class="mt-3 h-2 bg-amber-900/40 rounded-full">
        <div class="h-2 bg-white rounded-full" style="width:92%"></div>
      </div>
    </div>
    <div class="bg-white rounded-3xl p-4 flex flex-col justify-between">
      <p class="text-stone-400 text-xs font-semibold">蛋白質</p>
      <div>
        <p class="text-2xl font-black text-stone-800">98<span class="text-base font-semibold text-stone-400"> g</span></p>
        <p class="text-xs text-stone-400 mt-0.5">目標 120 g</p>
      </div>
      <div class="h-1.5 bg-stone-100 rounded-full"><div class="h-1.5 bg-sky-400 rounded-full" style="width:82%"></div></div>
    </div>
    <div class="bg-white rounded-3xl p-4 flex flex-col justify-between">
      <p class="text-stone-400 text-xs font-semibold">脂肪 / 碳水</p>
      <div>
        <p class="text-xl font-black text-stone-800">62 / 234<span class="text-sm font-semibold text-stone-400"> g</span></p>
      </div>
      <div class="h-1.5 bg-stone-100 rounded-full"><div class="h-1.5 bg-rose-400 rounded-full" style="width:54%"></div></div>
    </div>
  </div>
  <div class="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex gap-3 items-start">
    <span class="text-xl mt-0.5">🤖</span>
    <div>
      <p class="font-semibold text-amber-900 text-sm">下一餐建議</p>
      <p class="text-amber-800 text-sm mt-0.5">今天蛋白質還差 22g，晚餐建議選擇雞胸肉或豆腐為主，搭配蔬菜避免過多碳水，維持在 400–500 kcal 內。</p>
    </div>
  </div>
  <div class="space-y-4">
    <div class="bg-white rounded-3xl overflow-hidden shadow-sm">
      <div class="flex items-center justify-between px-5 py-4 border-b border-stone-100">
        <div class="flex items-center gap-2"><span class="text-lg">🌅</span><span class="font-bold text-stone-700">早餐</span><span class="text-xs text-stone-400 ml-1">08:23</span></div>
        <span class="font-black text-stone-700">580 kcal</span>
      </div>
      <div class="px-5 py-3 space-y-2">
        <div class="flex justify-between text-sm"><span class="text-stone-700">燕麥粥（200g）</span><span class="text-stone-500">210 kcal</span></div>
        <div class="flex justify-between text-sm"><span class="text-stone-700">水煮蛋 ×2</span><span class="text-stone-500">155 kcal</span></div>
        <div class="flex justify-between text-sm"><span class="text-stone-700">無糖豆漿（250ml）</span><span class="text-stone-500">75 kcal</span></div>
        <div class="flex justify-between text-sm"><span class="text-stone-700">香蕉（1根）</span><span class="text-stone-500">90 kcal</span></div>
        <div class="flex gap-4 text-xs text-stone-400 pt-1 border-t border-stone-50">
          <span>蛋白質 28g</span><span>脂肪 12g</span><span>碳水 68g</span>
        </div>
      </div>
    </div>
    <div class="bg-white rounded-3xl overflow-hidden shadow-sm">
      <div class="flex items-center justify-between px-5 py-4 border-b border-stone-100">
        <div class="flex items-center gap-2"><span class="text-lg">☀️</span><span class="font-bold text-stone-700">午餐</span><span class="text-xs text-stone-400 ml-1">12:45</span></div>
        <span class="font-black text-stone-700">720 kcal</span>
      </div>
      <div class="px-5 py-3 space-y-2">
        <div class="flex justify-between text-sm"><span class="text-stone-700">雞腿便當（附飯）</span><span class="text-stone-500">580 kcal</span></div>
        <div class="flex justify-between text-sm"><span class="text-stone-700">蔬菜湯</span><span class="text-stone-500">45 kcal</span></div>
        <div class="flex justify-between text-sm"><span class="text-stone-700">綠茶（無糖）</span><span class="text-stone-500">0 kcal</span></div>
        <div class="flex gap-4 text-xs text-stone-400 pt-1 border-t border-stone-50">
          <span>蛋白質 42g</span><span>脂肪 22g</span><span>碳水 88g</span>
        </div>
      </div>
    </div>
    <div class="bg-white rounded-3xl overflow-hidden shadow-sm">
      <div class="flex items-center justify-between px-5 py-4 border-b border-stone-100">
        <div class="flex items-center gap-2"><span class="text-lg">🍵</span><span class="font-bold text-stone-700">點心</span><span class="text-xs text-stone-400 ml-1">15:30</span></div>
        <span class="font-black text-stone-700">320 kcal</span>
      </div>
      <div class="px-5 py-3 space-y-2">
        <div class="flex justify-between text-sm"><span class="text-stone-700">希臘優格（150g）</span><span class="text-stone-500">130 kcal</span></div>
        <div class="flex justify-between text-sm"><span class="text-stone-700">堅果混合（25g）</span><span class="text-stone-500">148 kcal</span></div>
        <div class="flex gap-4 text-xs text-stone-400 pt-1 border-t border-stone-50">
          <span>蛋白質 14g</span><span>脂肪 10g</span><span>碳水 24g</span>
        </div>
      </div>
    </div>
  </div>
  <button class="w-full bg-amber-700 text-white font-bold rounded-2xl py-4 flex items-center justify-center gap-2 shadow-sm">
    <span class="text-xl">📸</span> 拍照新增餐點
  </button>
</main>
</body>
</html>"""

APP_DASHBOARD = """<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>App Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
*{box-sizing:border-box;}
body{font-family:system-ui,sans-serif;background:#f5f5f4;margin:0;width:390px;}
.status-bar{height:44px;background:white;display:flex;align-items:center;justify-content:space-between;padding:0 20px;font-size:12px;font-weight:600;}
.bottom-nav{background:white;border-top:1px solid #e7e5e4;display:flex;padding-bottom:20px;}
.nav-item{flex:1;display:flex;flex-direction:column;align-items:center;padding:10px 0 4px;gap:3px;font-size:11px;font-weight:600;color:#a8a29e;}
.nav-item.active{color:#92400e;}
.nav-icon{font-size:22px;}
</style>
</head>
<body>
<div class="status-bar"><span>12:48</span><span>📶 🔋</span></div>
<div style="padding-bottom:4px;">
  <div class="bg-white px-5 pt-4 pb-3">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-xs text-stone-400 font-semibold">2026年6月15日</p>
        <h1 class="text-xl font-black text-stone-800">今日飲食</h1>
      </div>
      <div class="w-9 h-9 rounded-full bg-amber-700 text-white flex items-center justify-center text-sm font-bold">洪</div>
    </div>
  </div>
  <div class="px-4 py-4 space-y-3">
    <div class="bg-amber-700 rounded-3xl p-5 text-white">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-amber-200 text-xs font-semibold">今日攝取</p>
          <p class="text-4xl font-black mt-0.5">1,842</p>
          <p class="text-amber-300 text-xs">/ 2,000 kcal</p>
        </div>
        <div class="text-right">
          <p class="text-amber-200 text-xs font-semibold">淨熱量</p>
          <p class="text-2xl font-black">+1,242</p>
          <p class="text-amber-300 text-xs">消耗 600 kcal</p>
        </div>
      </div>
      <div class="mt-3 h-2 bg-amber-900/40 rounded-full">
        <div class="h-2 bg-white rounded-full" style="width:92%"></div>
      </div>
    </div>
    <div class="grid grid-cols-3 gap-2">
      <div class="bg-white rounded-2xl p-3">
        <p class="text-xs text-stone-400 font-semibold">蛋白質</p>
        <p class="text-xl font-black text-sky-600">98<span class="text-xs font-medium text-stone-400">g</span></p>
        <div class="h-1 bg-stone-100 rounded mt-1"><div class="h-1 bg-sky-400 rounded" style="width:82%"></div></div>
      </div>
      <div class="bg-white rounded-2xl p-3">
        <p class="text-xs text-stone-400 font-semibold">脂肪</p>
        <p class="text-xl font-black text-rose-500">62<span class="text-xs font-medium text-stone-400">g</span></p>
        <div class="h-1 bg-stone-100 rounded mt-1"><div class="h-1 bg-rose-400 rounded" style="width:54%"></div></div>
      </div>
      <div class="bg-white rounded-2xl p-3">
        <p class="text-xs text-stone-400 font-semibold">碳水</p>
        <p class="text-xl font-black text-emerald-600">234<span class="text-xs font-medium text-stone-400">g</span></p>
        <div class="h-1 bg-stone-100 rounded mt-1"><div class="h-1 bg-emerald-400 rounded" style="width:78%"></div></div>
      </div>
    </div>
    <div class="bg-white rounded-2xl overflow-hidden">
      <div class="flex justify-between items-center px-4 py-3 border-b border-stone-50">
        <div class="flex items-center gap-2"><span>🌅</span><span class="font-bold text-stone-700 text-sm">早餐</span><span class="text-xs text-stone-400">08:23</span></div>
        <span class="font-black text-stone-600 text-sm">580 kcal</span>
      </div>
      <div class="px-4 py-2"><div class="flex justify-between text-xs text-stone-600"><span>燕麥粥、水煮蛋、豆漿、香蕉</span><span class="text-stone-400">580</span></div></div>
    </div>
    <div class="bg-white rounded-2xl overflow-hidden">
      <div class="flex justify-between items-center px-4 py-3 border-b border-stone-50">
        <div class="flex items-center gap-2"><span>☀️</span><span class="font-bold text-stone-700 text-sm">午餐</span><span class="text-xs text-stone-400">12:45</span></div>
        <span class="font-black text-stone-600 text-sm">720 kcal</span>
      </div>
      <div class="px-4 py-2"><div class="flex justify-between text-xs text-stone-600"><span>雞腿便當、蔬菜湯、綠茶</span><span class="text-stone-400">720</span></div></div>
    </div>
    <div class="bg-white rounded-2xl overflow-hidden">
      <div class="flex justify-between items-center px-4 py-3 border-b border-stone-50">
        <div class="flex items-center gap-2"><span>🍵</span><span class="font-bold text-stone-700 text-sm">點心</span><span class="text-xs text-stone-400">15:30</span></div>
        <span class="font-black text-stone-600 text-sm">320 kcal</span>
      </div>
      <div class="px-4 py-2"><div class="flex justify-between text-xs text-stone-600"><span>希臘優格、堅果</span><span class="text-stone-400">320</span></div></div>
    </div>
    <div class="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
      <p class="text-xs font-bold text-amber-800">🤖 下一餐建議</p>
      <p class="text-xs text-amber-700 mt-1">今天蛋白質還差 22g，晚餐建議雞胸肉搭配蔬菜，400–500 kcal 以內。</p>
    </div>
    <button class="w-full bg-amber-700 text-white font-bold rounded-2xl py-4 flex items-center justify-center gap-2 text-sm">📸 拍照新增餐點</button>
  </div>
</div>
<div class="bottom-nav">
  <div class="nav-item active"><div class="nav-icon">🍽️</div>飲食</div>
  <div class="nav-item"><div class="nav-icon">❤️</div>健康</div>
  <div class="nav-item"><div class="nav-icon">⚙️</div>設定</div>
</div>
</body>
</html>"""

APP_DAILY_SUMMARY = """<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>Daily Summary</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
*{box-sizing:border-box;}
body{font-family:system-ui,sans-serif;margin:0;background:rgba(12,10,9,0.72);width:390px;height:844px;display:flex;align-items:center;justify-content:center;padding:24px;}
</style>
</head>
<body>
<div style="background:white;border-radius:24px;width:100%;overflow:hidden;box-shadow:0 24px 48px rgba(0,0,0,0.3);">
  <div style="padding:20px 20px 16px;border-bottom:1px solid #e7e5e4;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;">
      <div>
        <h2 style="font-size:22px;font-weight:900;color:#1c1917;margin:0;">昨日總結</h2>
        <p style="font-size:13px;color:#78716c;margin:4px 0 0;">攝取 1,756 kcal</p>
      </div>
      <button style="background:#f5f5f4;border:none;border-radius:20px;padding:6px 12px;font-size:13px;font-weight:600;color:#78716c;">關閉</button>
    </div>
  </div>
  <div style="padding:16px 20px;">
    <p style="font-size:14px;color:#292524;line-height:1.6;margin:0 0 12px;">
      昨天整體熱量控制良好，達成率 <strong>88%</strong>，三餐分布均衡。蛋白質攝取 <strong>102g</strong>，超過目標 2g，優秀！脂肪稍偏高，主要來自午餐的排骨便當，下午的堅果點心可以適量減少。
    </p>
    <p style="font-size:14px;color:#292524;line-height:1.6;margin:0 0 16px;">
      碳水化合物 <strong>218g</strong>，在目標範圍內，以複合碳水（燕麥、糙米）為主，血糖較穩定。水分攝取略不足，建議今天多補充。
    </p>
    <div style="background:#fffbeb;border-radius:16px;padding:14px 16px;">
      <p style="font-size:13px;font-weight:900;color:#92400e;margin:0 0 6px;">建議</p>
      <ul style="margin:0;padding-left:16px;font-size:13px;color:#78350f;line-height:1.7;">
        <li>今天午餐可以改選蒸魚或烤雞胸，減少油脂攝取。</li>
        <li>下午加餐優先選擇低脂高蛋白，例如茶葉蛋或無糖優格。</li>
        <li>睡前 2 小時避免進食，幫助消化與睡眠品質。</li>
      </ul>
    </div>
  </div>
  <div style="padding:12px 20px 16px;border-top:1px solid #e7e5e4;">
    <button style="width:100%;background:#92400e;color:white;border:none;border-radius:16px;padding:14px;font-size:15px;font-weight:700;">知道了</button>
  </div>
</div>
</body>
</html>"""

APP_HEALTH_SYNC = """<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>Health Sync</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
*{box-sizing:border-box;}
body{font-family:system-ui,sans-serif;background:#f5f5f4;margin:0;width:390px;}
.status-bar{height:44px;background:white;display:flex;align-items:center;justify-content:space-between;padding:0 20px;font-size:12px;font-weight:600;}
.bottom-nav{background:white;border-top:1px solid #e7e5e4;display:flex;padding-bottom:20px;}
.nav-item{flex:1;display:flex;flex-direction:column;align-items:center;padding:10px 0 4px;gap:3px;font-size:11px;font-weight:600;color:#a8a29e;}
.nav-item.active{color:#92400e;}
.nav-icon{font-size:22px;}
.card{background:white;border-radius:20px;margin:0 0 12px;overflow:hidden;}
.metric-row{display:flex;justify-content:space-between;align-items:center;padding:11px 16px;border-bottom:1px solid #fafaf9;}
.metric-label{font-size:13px;color:#78716c;}
.metric-value{font-size:15px;font-weight:800;color:#1c1917;}
.metric-sub{font-size:11px;color:#a8a29e;margin-top:1px;}
.badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;}
</style>
</head>
<body>
<div class="status-bar"><span>12:48</span><span>📶 🔋</span></div>
<div style="padding-bottom:4px;">
  <div style="background:white;padding:16px 16px 12px;">
    <h1 style="font-size:20px;font-weight:900;color:#1c1917;margin:0;">健康</h1>
  </div>
  <div style="padding:12px 16px;">
    <div class="card">
      <div style="padding:14px 16px 10px;border-bottom:1px solid #f5f5f4;display:flex;align-items:center;gap:8px;">
        <span style="font-size:18px;">🔥</span>
        <span style="font-size:14px;font-weight:700;color:#292524;">淨熱量</span>
        <span class="badge" style="background:#fef3c7;color:#92400e;">今日</span>
      </div>
      <div style="padding:12px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <p style="font-size:32px;font-weight:900;color:#92400e;margin:0;">+1,242</p>
            <p style="font-size:12px;color:#a8a29e;margin:2px 0 0;">kcal 盈餘</p>
          </div>
          <div style="text-align:right;font-size:12px;color:#78716c;line-height:1.9;">
            <div>攝取 <strong style="color:#1c1917;">1,842</strong> kcal</div>
            <div>消耗 <strong style="color:#1c1917;">600</strong> kcal</div>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div style="padding:14px 16px 10px;border-bottom:1px solid #f5f5f4;display:flex;align-items:center;gap:8px;">
        <span style="font-size:18px;">⚖️</span>
        <span style="font-size:14px;font-weight:700;color:#292524;">體型數據</span>
        <span class="badge" style="background:#e0f2fe;color:#0369a1;">Health Connect</span>
      </div>
      <div class="metric-row"><span class="metric-label">體重</span><div style="text-align:right;"><div class="metric-value">72.3 kg</div><div class="metric-sub">6/14 08:12</div></div></div>
      <div class="metric-row"><span class="metric-label">身高</span><div style="text-align:right;"><div class="metric-value">175 cm</div><div class="metric-sub">上次記錄</div></div></div>
      <div class="metric-row" style="border-bottom:none;"><span class="metric-label">BMI</span><div style="text-align:right;"><div class="metric-value">23.6</div><div class="metric-sub">正常範圍</div></div></div>
    </div>
    <div class="card">
      <div style="padding:14px 16px 10px;border-bottom:1px solid #f5f5f4;display:flex;align-items:center;gap:8px;">
        <span style="font-size:18px;">🏃</span>
        <span style="font-size:14px;font-weight:700;color:#292524;">活動消耗</span>
        <span class="badge" style="background:#e0f2fe;color:#0369a1;">今日</span>
      </div>
      <div class="metric-row"><span class="metric-label">總消耗熱量</span><div style="text-align:right;"><div class="metric-value">600 kcal</div><div class="metric-sub">基礎 + 活動</div></div></div>
      <div class="metric-row"><span class="metric-label">步數</span><div style="text-align:right;"><div class="metric-value">8,432</div><div class="metric-sub">步</div></div></div>
      <div class="metric-row" style="border-bottom:none;"><span class="metric-label">睡眠</span><div style="text-align:right;"><div class="metric-value">7:24</div><div class="metric-sub">昨晚</div></div></div>
    </div>
    <button style="width:100%;background:#92400e;color:white;border:none;border-radius:16px;padding:14px;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;">♻️ 立即同步 Health Connect</button>
  </div>
</div>
<div class="bottom-nav">
  <div class="nav-item"><div class="nav-icon">🍽️</div>飲食</div>
  <div class="nav-item active"><div class="nav-icon">❤️</div>健康</div>
  <div class="nav-item"><div class="nav-icon">⚙️</div>設定</div>
</div>
</body>
</html>"""

def shot(pw, html: str, filename: str, width: int, height: int):
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": width, "height": height})
    page.set_content(html, wait_until="networkidle")
    page.wait_for_timeout(2000)  # let Tailwind CDN apply
    out_path = os.path.join(OUT, filename)
    page.screenshot(path=out_path, clip={"x": 0, "y": 0, "width": width, "height": height})
    browser.close()
    print(f"OK  {filename}")

with sync_playwright() as pw:
    shot(pw, WEB_DASHBOARD,     "web-dashboard.png",     1280, 900)
    shot(pw, APP_DASHBOARD,     "app-dashboard.png",     390,  844)
    shot(pw, APP_DAILY_SUMMARY, "app-daily-summary.png", 390,  844)
    shot(pw, APP_HEALTH_SYNC,   "app-health-sync.png",   390,  844)

print("\nAll screenshots saved to docs/screenshots/")
