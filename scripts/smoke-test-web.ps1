<#
.SYNOPSIS
  AI Food Diary — WEB HTTP 煙霧測試
  對本機 dev server 逐一打每個 /api 端點，快速回報功能是否正常（PASS/FAIL/SKIP）。

.DESCRIPTION
  先決條件：本機已 `npm run dev`（.env 至少有 ENCRYPTION_KEY、AUTH_SECRET；AI 測試另需 OPENAI_API_KEY）。

  流程：
    1. 先測公開端點與認證閘門（不帶 cookie）。
    2. 以 -TestEmail/-TestPassword 登入；401 則嘗試註冊（首位使用者自動為管理員）。
    3. 帶 session 測認證保護端點：設定檔／餐點／喝水／常用食物／健康／昨日總結（peek）。
    4. 若測試帳號為管理員（或另傳 -AdminEmail/-AdminPassword），測管理員端點。
    5. 加 -IncludeAi 才測 AI 端點（會花 OpenAI 配額；未設金鑰會回 SKIP 而非 FAIL）。

  清理：餐點／喝水／健康連線會建立後刪除；常用食物會建立後封存。

.PARAMETER BaseUrl
  dev server base URL，預設 http://localhost:3000

.PARAMETER TestEmail / TestPassword
  測試帳號。預設 smoke@test.local / SmokeTest123!。重複執行會重用同一帳號。

.PARAMETER AdminEmail / AdminPassword
  選填。當測試帳號非管理員時，另傳管理員帳號來測 /api/admin/* 端點。

.PARAMETER IncludeAi
  連 AI 端點也測（會呼叫 OpenAI / 相容服務，花配額）。

.EXAMPLE
  ./scripts/smoke-test-web.ps1
  ./scripts/smoke-test-web.ps1 -BaseUrl http://localhost:3000 -IncludeAi
  ./scripts/smoke-test-web.ps1 -AdminEmail admin@example.com -AdminPassword 'AdminPass123!'
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$TestEmail = "smoke@test.local",
  [string]$TestPassword = "SmokeTest123!",
  [string]$AdminEmail = "",
  [string]$AdminPassword = "",
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
Write-Host "目標: $BaseUrl   帳號: $TestEmail   AI: $(if($IncludeAi){'啟用'}else{'關閉'})" -ForegroundColor DarkGray
$preflight = Send-Request -Method GET -Uri "$BaseUrl/api/app/version"
if ($preflight.StatusCode -eq 0) {
  Write-Host ""
  Write-Host "❌ 無法連到 $BaseUrl（$(Short $preflight.Content 80)）" -ForegroundColor Red
  Write-Host "   請先在本機執行：npm run dev" -ForegroundColor Yellow
  exit 1
}

# ---------- sessions ----------
$script:session = New-Session       # 測試帳號 session
$script:adminSession = New-Session   # 管理員 session（若需要）
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
Write-Group "2. 認證（登入／註冊）"

$today    = (Get-Date).ToString("yyyy-MM-dd")
$yesterday= (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
$isoNow   = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

# 先嘗試登入；401 嘗試註冊；否則回報錯誤。
$login = Send-Request POST "$BaseUrl/api/auth/login" -Body @{ email=$TestEmail; password=$TestPassword } -Session $script:session
if ($login.StatusCode -eq 200) {
  $script:testUser = (Parse-Json $login.Content).user
  Add-Result 'Auth' '登入測試帳號' 'PASS' 'login 200'
} elseif ($login.StatusCode -eq 401) {
  $reg = Send-Request POST "$BaseUrl/api/auth/register" -Body @{ email=$TestEmail; password=$TestPassword; name='SmokeTest' } -Session $script:session
  if ($reg.StatusCode -eq 200) {
    $script:testUser = (Parse-Json $reg.Content).user
    Add-Result 'Auth' '註冊測試帳號' 'PASS' 'register 200'
  } elseif ($reg.StatusCode -eq 403) {
    Add-Result 'Auth' '取得測試 session' 'FAIL' "註冊已關閉且帳號不存在；請改用既有帳號 -TestEmail/-TestPassword"
  } elseif ($reg.StatusCode -eq 409) {
    Add-Result 'Auth' '取得測試 session' 'FAIL' "帳號已存在但密碼不符；請用正確的 -TestPassword"
  } else {
    Add-Result 'Auth' '取得測試 session' 'FAIL' "register status $($reg.StatusCode): $(Short $reg.Content)"
  }
} else {
  Add-Result 'Auth' '取得測試 session' 'FAIL' "login status $($login.StatusCode): $(Short $login.Content)"
}

if ($script:testUser) {
  $script:testIsAdmin = [bool]$script:testUser.isAdmin
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
Write-Group "9. 管理（管理員端點）"
$script:adminReady = $script:testIsAdmin
$script:adminSessionResolved = $script:session
if (-not $script:testIsAdmin -and $AdminEmail -and $AdminPassword) {
  $al = Send-Request POST "$BaseUrl/api/auth/login" -Body @{ email=$AdminEmail; password=$AdminPassword } -Session $script:adminSession
  if ($al.StatusCode -eq 200 -and (Parse-Json $al.Content).user.isAdmin) {
    $script:adminReady = $true
    $script:adminSessionResolved = $script:adminSession
  } else {
    Add-Result 'Admin' '管理員登入' 'FAIL' "無法以 -AdminEmail 登入為管理員（status $($al.StatusCode)）"
  }
}
if ($script:adminReady) {
  Check 'Admin' 'GET /api/admin/settings' {
    $r = Send-Request GET "$BaseUrl/api/admin/settings" -Session $script:adminSessionResolved
    $j = Parse-Json $r.Content
    if ($r.StatusCode -eq 200 -and $null -ne $j.registrationOpen) { return @{ Status='PASS'; Detail="registrationOpen=$($j.registrationOpen)" } }
    @{ Status='FAIL'; Detail="status $($r.StatusCode)" }
  }
  $adminSettings = Send-Request GET "$BaseUrl/api/admin/settings" -Session $script:adminSessionResolved
  $currentFlag = (Parse-Json $adminSettings.Content).registrationOpen
  if ($null -ne $currentFlag) {
    Check 'Admin' 'PATCH /api/admin/settings (no-op)' {
      # 用目前值重送，確保不改變全域狀態。
      $r = Send-Request PATCH "$BaseUrl/api/admin/settings" -Body @{ registrationOpen=$currentFlag } -Session $script:adminSessionResolved
      if ($r.StatusCode -eq 200) { return @{ Status='PASS'; Detail="registrationOpen=$currentFlag (unchanged)" } }
      @{ Status='FAIL'; Detail="status $($r.StatusCode): $(Short $r.Content)" }
    }
  }
} else {
  Add-Result 'Admin' 'GET /api/admin/settings' 'SKIP' '測試帳號非管理員；傳 -AdminEmail/-AdminPassword 來測'
  Add-Result 'Admin' 'PATCH /api/admin/settings' 'SKIP' '測試帳號非管理員；傳 -AdminEmail/-AdminPassword 來測'
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