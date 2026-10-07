# Web PWA 與離線資料政策

## 安裝與離線體驗

- `public/manifest.webmanifest` 定義 standalone 安裝、品牌色、`/dashboard` 起始頁與 192／512px 圖示；根 layout 同時提供 iOS 主畫面圖示。
- 生產環境載入任何頁面時註冊根路徑 `/sw.js`，以支援登入前安裝與通用離線頁。開發環境不註冊，避免本機開發頁被舊快取攔截。
- 離線時顯示一般性的 `public/offline.html`，應用程式頁面另顯示連線狀態。離線頁不包含使用者或帳號資料。
- 網頁表單的文字草稿保存在目前瀏覽器，最多 7 天；照片、遠端常用食物 ID 與餐組 ID 不保存在草稿中。草稿不是雲端餐點，離線不能呼叫 AI 或送出餐點。

## Service Worker 快取範圍

只使用 `ai-food-diary-static-v1` 快取以下公開靜態內容：

- 安裝預快取：`/offline.html`、`/icons/icon-192.png`、`/icons/icon-512.png`。
- 執行時允許：Next.js 不可變資源 `/_next/static/**`、`/images/meal-journal.jpg` 與上述圖示；僅接受成功、同源的 CSS／JavaScript／圖片／字型／WASM 回應，且拒絕 `private`、`no-store`、`Set-Cookie` 或 `Vary: Cookie` 回應。
- 導覽文件只走網路，網路失敗時才回傳通用離線頁；不快取 HTML 文件或伺服器渲染頁。
- `/api/**`、`/_next/data/**`、含 query 的資源、跨來源資源、非 GET 與帶 Authorization 的請求一律不進快取。任何個人化 API 回應、餐點／健康／個人資料、驗證 Cookie 或圖片簽章 URL 都不會被 Service Worker 儲存。

## 失效與登出

- 快取名稱帶版本。更新預快取資產或快取政策時遞增 `STATIC_CACHE` 版本；啟用新 Worker 時會移除舊 `ai-food-diary-*` 快取。Next.js 指紋化資源以新 URL 更新。
- 登出先清除 `ai-food-diary:` 本機儲存資料、舊版摘要標記及 `ai-food-diary-*` Cache Storage，再向伺服器清除 HttpOnly session cookie。若清理或登出請求失敗，畫面不會宣稱已登出，並提示使用者重試。
- 餐點草稿以內部使用者 ID 分隔，無效或超過 7 天的資料會刪除；成功儲存餐點或手動清除時刪除該草稿。不同帳號不會讀取彼此的草稿。
- 本機草稿屬於瀏覽器同源儲存，未做用戶端加密；共用裝置應在離開前登出。登出清除上述應用程式命名空間。

## 不在本次範圍

目前離線不提供舊餐點檢視、離線建立／同步、重試佇列、冪等鍵或跨裝置衝突解決。服務工作者只保留公開外殼資源，不作為個人資料的離線資料庫。
