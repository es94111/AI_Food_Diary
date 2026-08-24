<#
.SYNOPSIS
  AI Food Diary — WEB HTTP 煙霧測試
  對本機 dev server 逐一打每個 /api 端點，快速回報功能是否正常（PASS/FAIL/SKIP）。

.DESCRIPTION
  先決條件：本機已 `npm run dev`（.env 至少有 ENCRYPTION_KEY、AUTH_SECRET；AI 測試另需 OPENAI_API_KEY）。

  流程：
    1. 先測公開端點、SSO 認證閘門與已停用的舊帳密端點。
    2. 只有在同時傳入 -GoogleIdToken 與 -TurnstileToken 時，才以 Google SSO 建立測試 session。
    3. 帶 session 測認證保護端點：設定檔／餐點／喝水／常用食物／健康／昨日總結（peek）。
    4. 驗證舊管理員註冊設定端點已停用。
    5. 加 -IncludeAi 才測 AI 端點（會花 OpenAI 配額；未設金鑰會回 SKIP 而非 FAIL）。

  清理：餐點／喝水／健康連線會建立後刪除；常用食物會建立後封存。

.PARAMETER BaseUrl
  dev server base URL，預設 http://localhost:3000

.PARAMETER GoogleIdToken
  選填的 Google ID token。需搭配新鮮的 -TurnstileToken 才會建立測試 session；token 不會寫入檔案或輸出。

.PARAMETER TurnstileToken
  選填的、尚未使用的 Cloudflare Turnstile token。只存在記憶體中，不會寫入檔案或輸出。

.PARAMETER IncludeAi
  連 AI 端點也測（會呼叫 OpenAI / 相容服務，花配額）。

.EXAMPLE
  ./scripts/smoke-test-web.ps1
  ./scripts/smoke-test-web.ps1 -BaseUrl http://localhost:3000 -GoogleIdToken '<short-lived token>' -TurnstileToken '<fresh token>'
  ./scripts/smoke-test-web.ps1 -BaseUrl http://localhost:3000 -GoogleIdToken '<short-lived token>' -TurnstileToken '<fresh token>' -IncludeAi
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$GoogleIdToken = "",
  [string]$TurnstileToken = "",
  [switch]$IncludeAi
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')

# 1x1 PNG（透明）作為 AI 圖片端點的最小測試圖。
$script:TinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8QAAABsQV84m8AAAAASUVORK5CYII="

# ---------- helpers ----------

function New-Session { New-Object Microsoft.PowerShell.Commands.WebRequestSession }

function Send-Request {
  param(
    [Parameter(Mandatory)][string]$Method,
    [Parameter(Mandatory)][string]$Uri,
    $Body,
    $Session,
    [hashtable]$Headers = @{}
  )
  $p = @{
    Method = $Method
    Uri    = $Uri
    UseBasicParsing = $true
    ErrorAction     = 'Stop'
    TimeoutSec      = 90
  }
  if ($Session) { $p.WebSession = $Session }
  if ($Headers.Count) { $p.Headers = $Headers }
  if ($Body) {
    $p.Body = ($Body | ConvertTo-Json -Depth 12 -Compress)
    $p.ContentType = 'application/json'
  }
  try {
    $resp = Invoke-WebRequest @p
    return [pscustomobject]@{ StatusCode = [int]$resp.StatusCode; Content = [string]$resp.Content; Ok = ($resp.StatusCode -lt 400) }
  } catch {
    $ex = $_.Exception
    $status = 0; $content = ''
    if ($ex.Response) {
      try { $status = [int]$ex.Response.StatusCode } catch {}
      if ($ex.ErrorDetails -and $ex.ErrorDetails.Message) { $content = [string]$ex.ErrorDetails.Message }
      else {
        try {
          $stream = $ex.Response.GetResponseStream()
          $reader = New-Object System.IO.StreamReader($stream)
          $content = $reader.ReadToEnd(); $reader.Close()
        } catch { $content = $ex.Message }
      }
    } else { $content = $ex.Message }
    return [pscustomobject]@{ StatusCode = $status; Content = $content; Ok = $false }
  }
}

function Parse-Json([string]$content) {
  if (-not $content) { return $null }
  try { return $content | ConvertFrom-Json } catch { return $null }
}

function Short([string]$s, [int]$n = 100) {
  if (-not $s) { return "" }
  $s = ($s -replace '\s+', ' ').Trim()
  if ($s.Length -gt $n) { return $s.Substring(0, $n) + "…" }
  return $s
}

# AI 端點結果分類：200=PASS；429=SKIP(速率)；400 且 body 提到金鑰/OPENAI=SKIP(未設定)；502=SKIP(供應商)；其餘=FAIL。
function Ai-Result($r) {
  if ($r.StatusCode -eq 200) { return @{ Status = 'PASS'; Detail = '' } }
  if ($r.StatusCode -eq 429) { return @{ Status = 'SKIP'; Detail = '速率限制' } }
  if ($r.StatusCode -eq 400 -and ($r.Content -match '金鑰|OPENAI_API_KEY')) { return @{ Status = 'SKIP'; Detail = 'AI 未設定' } }
  if ($r.StatusCode -eq 502) { return @{ Status = 'SKIP'; Detail = '供應商錯誤: ' + (Short $r.Content) } }
  if ($r.StatusCode -eq 401) { return @{ Status = 'FAIL'; Detail = '未授權' } }
  return @{ Status = 'FAIL'; Detail = "status $($r.StatusCode): " + (Short $r.Content) }
}

# ---------- results ----------

$script:results = [System.Collections.ArrayList]::new()
function Add-Result([string]$Group, [string]$Name, [string]$Status, [string]$Detail) {
  [void]$script:results.Add([pscustomobject]@{ Group = $Group; Name = $Name; Status = $Status; Detail = $Detail })
}

function Check([string]$Group, [string]$Name, [scriptblock]$Test) {
  try {
    $r = & $Test
    if ($null -eq $r) { $r = @{ Status = 'PASS'; Detail = '' } }
    Add-Result $Group $Name $r.Status $r.Detail
  } catch {
    Add-Result $Group $Name 'FAIL' (Short $_.Exception.Message)
  }
}

function Write-Group([string]$title) {
  Write-Host ""
  Write-Host "── $title ──" -ForegroundColor Cyan
}

# ---------- preflight ----------
Write-Host "AI Food Diary · WEB HTTP 煙霧測試" -ForegroundColor White
Write-Host "目標: $BaseUrl   認證: $(if($GoogleIdToken -and $TurnstileToken){'Google SSO + Turnstile'}elseif($GoogleIdToken){'缺 Turnstile token'}else{'未提供 token'})   AI: $(if($IncludeAi){'啟用'}else{'關閉'})" -ForegroundColor DarkGray
$preflight = Send-Request -Method GET -Uri "$BaseUrl/api/app/version"
if ($preflight.StatusCode -eq 0) {
  Write-Host ""
  Write-Host "❌ 無法連到 $BaseUrl（$(Short $preflight.Content 80)）" -ForegroundColor Red
  Write-Host "   請先在本機執行：npm run dev" -ForegroundColor Yellow
  exit 1
}

# ---------- sessions ----------
$script:session = New-Session       # Google SSO 測試 session
$script:testUser = $null
$script:testIsAdmin = $false

# ---------- 1. Public / Auth gate ----------
Write-Group "1. 公開端點與認證閘門"

Check 'Public' 'GET /api/app/version' {
  $r = Send-Request GET "$BaseUrl/api/app/version"
  $j = Parse-Json $r.Content
  if ($r.StatusCode -ne 200 -or -not $j.webVersion) { return @{ Status='FAIL'; Detail="status $($r.StatusCode)" } }
  @{ Status='PASS'; Detail="web v$($j.webVersion), apk v$($j.latestVersion)" }
}

Check 'Public' 'GET /api/app/download' {
  $r = Send-Request GET "$BaseUrl/api/app/download"
  if ($r.StatusCode -eq 200 -or $r.StatusCode -eq 404) { return @{ Status='PASS'; Detail="status $($r.StatusCode)" } }
  @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
}

Check 'Public' 'GET / (landing)' {
  $r = Send-Request GET "$BaseUrl/"
  if ($r.StatusCode -ne 200) { return @{ Status='FAIL'; Detail="status $($r.StatusCode)" } }
  @{ Status='PASS'; Detail='200' }
}

Check 'Public' 'GET /login' {
  $r = Send-Request GET "$BaseUrl/login"
  if ($r.StatusCode -ne 200) { return @{ Status='FAIL'; Detail="status $($r.StatusCode)" } }
  @{ Status='PASS'; Detail='200' }
}

Check 'Auth gate' 'GET /api/me (未登入應 401)' {
  $r = Send-Request GET "$BaseUrl/api/me"
  if ($r.StatusCode -eq 401) { return @{ Status='PASS'; Detail='401' } }
  @{ Status='FAIL'; Detail="預期 401，實際 $($r.StatusCode)" }
}

Check 'Auth gate' 'GET /api/meals (未登入應 401)' {
  $r = Send-Request GET "$BaseUrl/api/meals"
  if ($r.StatusCode -eq 401) { return @{ Status='PASS'; Detail='401' } }
  @{ Status='FAIL'; Detail="預期 401，實際 $($r.StatusCode)" }
}

# ---------- 2. Auth ----------
Write-Group "2. 認證（Google SSO）"

$today    = (Get-Date).ToString("yyyy-MM-dd")
$yesterday= (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
$isoNow   = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

Check 'Auth policy' 'POST /api/auth/login (帳密已停用)' {
  $r = Send-Request POST "$BaseUrl/api/auth/login"
  if ($r.StatusCode -eq 410) { return @{ Status='PASS'; Detail='410' } }
  @{ Status='FAIL'; Detail="預期 410，實際 $($r.StatusCode)" }
}

Check 'Auth policy' 'POST /api/auth/register (帳密已停用)' {
  $r = Send-Request POST "$BaseUrl/api/auth/register"
  if ($r.StatusCode -eq 410) { return @{ Status='PASS'; Detail='410' } }
  @{ Status='FAIL'; Detail="預期 410，實際 $($r.StatusCode)" }
}

Check 'Auth policy' 'POST /api/auth/google (缺 Turnstile 應 403)' {
  $r = Send-Request POST "$BaseUrl/api/auth/google" -Body @{ idToken='smoke-test-invalid-id-token' }
  if ($r.StatusCode -eq 403) { return @{ Status='PASS'; Detail='missing Turnstile rejected' } }
  @{ Status='FAIL'; Detail="預期 403，實際 $($r.StatusCode): $(Short $r.Content)" }
}

if ($GoogleIdToken -and $TurnstileToken) {
  $login = Send-Request POST "$BaseUrl/api/auth/google" -Body @{
    idToken = $GoogleIdToken
    'cf-turnstile-response' = $TurnstileToken
  } -Session $script:session
  if ($login.StatusCode -eq 200) {
    $script:testUser = (Parse-Json $login.Content).user
    $script:testIsAdmin = [bool]$script:testUser.isAdmin
    Add-Result 'Auth' 'Google SSO 測試 session' 'PASS' 'google 200'
  } else {
    Add-Result 'Auth' 'Google SSO 測試 session' 'FAIL' "google status $($login.StatusCode): $(Short $login.Content)"
  }
} elseif ($GoogleIdToken) {
  Add-Result 'Auth' 'Google SSO 測試 session' 'SKIP' 'Google SSO 現在需要同時傳入新鮮 -TurnstileToken'
} else {
  Add-Result 'Auth' 'Google SSO 測試 session' 'SKIP' '請同時傳入短效 -GoogleIdToken 與新鮮 -TurnstileToken 才能測試需登入端點'
}

if ($script:testUser) {
  Check 'Auth' 'GET /api/me' {
    $r = Send-Request GET "$BaseUrl/api/me" -Session $script:session
    $j = Parse-Json $r.Content
    if ($r.StatusCode -eq 200 -and $j.user) { return @{ Status='PASS'; Detail="isAdmin=$($j.user.isAdmin)" } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
  }
}

# ---------- 3. Profile ----------
Write-Group "3. 設定檔"
if ($script:testUser) {
  Check 'Profile' 'PATCH /api/me' {
    $r = Send-Request PATCH "$BaseUrl/api/me" -Body @{ goal='MAINTAIN' } -Session $script:session
    if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='profile updated' } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
  }
  Check 'Profile' 'POST /api/me/timezone' {
    $r = Send-Request POST "$BaseUrl/api/me/timezone" -Body @{ timezone='Asia/Taipei' } -Session $script:session
    if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='ok' } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
  }
  Check 'Profile' 'GET /api/me/ai-settings' {
    $r = Send-Request GET "$BaseUrl/api/me/ai-settings" -Session $script:session
    $j = Parse-Json $r.Content
    if ($r.StatusCode -eq 200 -and $j.settings) { return @{ Status='PASS'; Detail="provider=$($j.settings.provider) hasKey=$($j.settings.hasKey)" } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
  }
}

# ---------- 4. Meals ----------
Write-Group "4. 餐點（建立→讀→更新→刪除）"
if ($script:testUser) {
  $createdMealId = $null
  Check 'Meals' 'GET /api/meals?date=today' {
    $r = Send-Request GET "$BaseUrl/api/meals?date=$today" -Session $script:session
    if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='200' } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
  }
  Check 'Meals' 'POST /api/meals (手動項目)' {
    $body = @{ mealType='SNACK'; manualItems=@(@{ name='SmokeTest 餐點'; estimatedAmount='1 份'; calories=120; protein=4; fat=2; carbs=18 }) }
    $r = Send-Request POST "$BaseUrl/api/meals" -Body $body -Session $script:session
    $j = Parse-Json $r.Content
    if ($r.StatusCode -eq 200 -and $j.meal.id) { $script:createdMealId = $j.meal.id; return @{ Status='PASS'; Detail="id=$($j.meal.id)" } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
  }
  if ($script:createdMealId) {
    Check 'Meals' 'GET /api/meals/[id]' {
      $r = Send-Request GET "$BaseUrl/api/meals/$script:createdMealId" -Session $script:session
      if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='200' } }
      @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
    }
    Check 'Meals' 'PATCH /api/meals/[id]' {
      $items = @(
        @{ name='SmokeTest A'; estimatedAmount='1 份'; calories=60; protein=2; fat=1; carbs=9 }
        @{ name='SmokeTest B'; estimatedAmount='1 份'; calories=60; protein=2; fat=1; carbs=9 }
      )
      $r = Send-Request PATCH "$BaseUrl/api/meals/$script:createdMealId" -Body @{ mealType='SNACK'; items=$items } -Session $script:session
      if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='items replaced' } }
      @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
    }
    Check 'Meals' 'DELETE /api/meals/[id]' {
      $r = Send-Request DELETE "$BaseUrl/api/meals/$script:createdMealId" -Session $script:session
      if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='ok' } }
      @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
    }
  }
}

# ---------- 5. Water ----------
Write-Group "5. 喝水（新增→刪除）"
if ($script:testUser) {
  $waterId = $null
  Check 'Water' 'GET /api/water?date=today' {
    $r = Send-Request GET "$BaseUrl/api/water?date=$today" -Session $script:session
    if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='200' } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
  }
  Check 'Water' 'POST /api/water' {
    $r = Send-Request POST "$BaseUrl/api/water" -Body @{ amountMl=250 } -Session $script:session
    $j = Parse-Json $r.Content
    if ($r.StatusCode -eq 200 -and $j.log.id) { $script:waterId = $j.log.id; return @{ Status='PASS'; Detail="id=$($j.log.id)" } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
  }
  if ($script:waterId) {
    Check 'Water' 'DELETE /api/water/[id]' {
      $r = Send-Request DELETE "$BaseUrl/api/water/$script:waterId" -Session $script:session
      if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='ok' } }
      @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
    }
  }
}

# ---------- 6. Saved foods ----------
Write-Group "6. 常用食物（建立→更新→標記使用→封存）"
if ($script:testUser) {
  $foodId = $null
  Check 'SavedFoods' 'GET /api/saved-foods' {
    $r = Send-Request GET "$BaseUrl/api/saved-foods" -Session $script:session
    if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='200' } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
  }
  Check 'SavedFoods' 'POST /api/saved-foods' {
    $body = @{ name="SmokeTest Food $(Get-Date -Format 'yyyyMMddHHmmss')"; estimatedAmount='1 份'; calories=100; protein=5; fat=2; carbs=20; allowDuplicate=$true }
    $r = Send-Request POST "$BaseUrl/api/saved-foods" -Body $body -Session $script:session
    $j = Parse-Json $r.Content
    if ($r.StatusCode -eq 200 -and $j.food.id) { $script:foodId = $j.food.id; return @{ Status='PASS'; Detail="id=$($j.food.id)" } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
  }
  if ($script:foodId) {
    Check 'SavedFoods' 'PATCH /api/saved-foods/[id]' {
      $r = Send-Request PATCH "$BaseUrl/api/saved-foods/$script:foodId" -Body @{ isFavorite=$true } -Session $script:session
      if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='favorite set' } }
      @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
    }
    Check 'SavedFoods' 'POST /api/saved-foods/[id] (markUsed)' {
      $r = Send-Request POST "$BaseUrl/api/saved-foods/$script:foodId" -Session $script:session
      if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='marked' } }
      @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
    }
    Check 'SavedFoods' 'DELETE /api/saved-foods/[id] (archive)' {
      $r = Send-Request DELETE "$BaseUrl/api/saved-foods/$script:foodId" -Session $script:session
      if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='archived' } }
      @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
    }
  }
}

# ---------- 7. Health ----------
Write-Group "7. 健康（建立裝置→Bearer 上傳→歷史→撤銷）"
if ($script:testUser) {
  $connId = $null; $hcsToken = $null
  Check 'Health' 'GET /api/health/connections' {
    $r = Send-Request GET "$BaseUrl/api/health/connections" -Session $script:session
    if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='200' } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
  }
  Check 'Health' 'POST /api/health/connections' {
    $r = Send-Request POST "$BaseUrl/api/health/connections" -Body @{ deviceName='SmokeTest' } -Session $script:session
    $j = Parse-Json $r.Content
    if ($r.StatusCode -eq 200 -and $j.connection.id -and $j.token) {
      $script:connId = $j.connection.id; $script:hcsToken = $j.token
      return @{ Status='PASS'; Detail="conn=$($j.connection.id)" }
    }
    @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
  }
  Check 'Health' 'GET /api/health/sync (cookie)' {
    $r = Send-Request GET "$BaseUrl/api/health/sync" -Session $script:session
    if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='200' } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
  }
  if ($script:hcsToken) {
    Check 'Health' 'POST /api/health/sync (Bearer)' {
      $body = @{ source='HEALTH_CONNECT'; metrics=@(@{ type='STEPS'; value=100; unit='count'; measuredAt=$isoNow }) }
      $r = Send-Request POST "$BaseUrl/api/health/sync" -Body $body -Headers @{ Authorization="Bearer $script:hcsToken" }
      if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='synced' } }
      @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
    }
    Check 'Health' 'GET /api/health/history?types=STEPS' {
      $r = Send-Request GET "$BaseUrl/api/health/history?types=STEPS&limit=7" -Session $script:session
      if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='200' } }
      @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
    }
    if ($script:connId) {
      Check 'Health' 'DELETE /api/health/connections/[id]' {
        $r = Send-Request DELETE "$BaseUrl/api/health/connections/$script:connId" -Session $script:session
        if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='revoked' } }
        @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
      }
    }
  }
}

# ---------- 8. Daily summary / Next meal (peek, 不花 AI) ----------
Write-Group "8. 昨日總結／下一餐建議（peek，不花 AI）"
if ($script:testUser) {
  Check 'Summary' 'GET /api/daily-summary?date=yesterday (peek)' {
    $r = Send-Request GET "$BaseUrl/api/daily-summary?date=$yesterday" -Session $script:session
    if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='200' } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
  }
  Check 'Summary' 'GET /api/recommendations/next-meal?peek=1' {
    $r = Send-Request GET "$BaseUrl/api/recommendations/next-meal?peek=1" -Session $script:session
    if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail='200' } }
    $ai = Ai-Result $r
    if ($ai.Status -eq 'FAIL') { return $ai }
    @{ Status='SKIP'; Detail='AI 未設定，無法 peek' }
  }
}

# ---------- 9. Admin ----------
Write-Group "9. 舊管理設定（已停用）"
Check 'Admin policy' 'GET /api/admin/settings (註冊設定已停用)' {
  $r = Send-Request GET "$BaseUrl/api/admin/settings"
  if ($r.StatusCode -eq 410) { return @{ Status='PASS'; Detail='410' } }
  @{ Status='FAIL'; Detail="預期 410，實際 $($r.StatusCode)" }
}
Check 'Admin policy' 'PATCH /api/admin/settings (註冊設定已停用)' {
  $r = Send-Request PATCH "$BaseUrl/api/admin/settings" -Body @{ registrationOpen=$true }
  if ($r.StatusCode -eq 410) { return @{ Status='PASS'; Detail='410' } }
  @{ Status='FAIL'; Detail="預期 410，實際 $($r.StatusCode)" }
}

# ---------- 10. AI ----------
Write-Group "10. AI 端點（需要 -IncludeAi）"
if ($script:testUser -and $IncludeAi) {
  Check 'AI' 'POST /api/meals/analyze-description' {
    $r = Send-Request POST "$BaseUrl/api/meals/analyze-description" -Body @{ mealType='LUNCH'; description='一碗白飯和一個煎蛋' } -Session $script:session
    Ai-Result $r
  }
  Check 'AI' 'POST /api/meals/analyze-manual' {
    $body = @{ mealType='LUNCH'; manualItems=@(@{ name='白飯'; estimatedAmount='1 碗'; calories=280; protein=5; fat=1; carbs=60 }) }
    $r = Send-Request POST "$BaseUrl/api/meals/analyze-manual" -Body $body -Session $script:session
    Ai-Result $r
  }
  Check 'AI' 'POST /api/meals/reestimate' {
    $r = Send-Request POST "$BaseUrl/api/meals/reestimate" -Body @{ manualItems=@(@{ name='白飯'; estimatedAmount='1.5 碗' }) } -Session $script:session
    Ai-Result $r
  }
  Check 'AI' 'POST /api/meals/analyze (圖片)' {
    $r = Send-Request POST "$BaseUrl/api/meals/analyze" -Body @{ mealType='LUNCH'; imageDataUrls=@($script:TinyPng) } -Session $script:session
    Ai-Result $r
  }
  Check 'AI' 'POST /api/meals/analyze-nutrition-label' {
    $r = Send-Request POST "$BaseUrl/api/meals/analyze-nutrition-label" -Body @{ imageDataUrls=@($script:TinyPng) } -Session $script:session
    Ai-Result $r
  }
  Check 'AI' 'GET /api/daily-summary?generate=1 (昨日)' {
    $r = Send-Request GET "$BaseUrl/api/daily-summary?date=$yesterday&generate=1" -Session $script:session
    Ai-Result $r
  }
  Check 'AI' 'GET /api/recommendations/next-meal (generate)' {
    $r = Send-Request GET "$BaseUrl/api/recommendations/next-meal" -Session $script:session
    Ai-Result $r
  }
} elseif ($script:testUser) {
  $aiNote = '使用 -IncludeAi 啟用（會花 OpenAI 配額）'
  foreach ($n in 'analyze-description','analyze-manual','reestimate','analyze (圖片)','analyze-nutrition-label','daily-summary generate','next-meal generate') {
    Add-Result 'AI' $n 'SKIP' $aiNote
  }
}

# ---------- report ----------
Write-Host ""
Write-Host "══════════════════════════════════════════════════" -ForegroundColor White
$pass = ($script:results | Where-Object Status -eq 'PASS').Count
$fail = ($script:results | Where-Object Status -eq 'FAIL').Count
$skip = ($script:results | Where-Object Status -eq 'SKIP').Count
foreach ($r in $script:results) {
  $icon = switch ($r.Status) { 'PASS' { '✓' }; 'FAIL' { '✗' }; 'SKIP' { '·' } }
  $color = switch ($r.Status) { 'PASS' { 'Green' }; 'FAIL' { 'Red' }; 'SKIP' { 'DarkGray' } }
  $line = "{0} [{1}] {2}" -f $icon, $r.Group, $r.Name
  if ($r.Detail) { $line += " — $($r.Detail)" }
  Write-Host $line -ForegroundColor $color
}
Write-Host ""
Write-Host ("總計 {0}：{1} PASS / {2} FAIL / {3} SKIP" -f $script:results.Count, $pass, $fail, $skip) -ForegroundColor White
if ($fail -gt 0) {
  Write-Host "❌ 有 $fail 項失敗" -ForegroundColor Red
  exit 1
} else {
  Write-Host "✅ 沒有失敗項目" -ForegroundColor Green
  exit 0
}