# Flutter Health Connect Sync

AI Food Diary 的 Web 端已提供 Health Connect 同步 API。Flutter Android app 可以先用既有帳號登入建立同步裝置 token，之後使用 Bearer token 呼叫健康同步 API。

## 建議 Flutter 套件

```yaml
dependencies:
  dio: latest
  health: latest
  flutter_secure_storage: latest
```

## 建立同步裝置 Token

```http
POST /api/health/connections
```

第一次建立 token 需要帶登入後的 cookie：

```http
Cookie: food_diary_session=...
```

Payload：

```json
{
  "provider": "HEALTH_CONNECT",
  "deviceName": "Pixel 9"
}
```

成功回應：

```json
{
  "connection": {
    "id": "...",
    "provider": "HEALTH_CONNECT",
    "deviceName": "Pixel 9",
    "createdAt": "2026-05-29T08:00:00.000Z"
  },
  "token": "hcs_..."
}
```

`token` 只會回傳一次，Flutter app 應存進 Android secure storage。後端只保存 token hash。

## 同步 Endpoint

```http
POST /api/health/sync
```

建議使用 Bearer token：

```http
Authorization: Bearer hcs_...
```

也支援登入後的 cookie，方便 Web 除錯：

```http
Cookie: food_diary_session=...
```

Payload：

```json
{
  "source": "HEALTH_CONNECT",
  "metrics": [
    {
      "type": "STEPS",
      "value": 8421,
      "unit": "count",
      "measuredAt": "2026-05-29T08:00:00.000Z"
    },
    {
      "type": "WEIGHT",
      "value": 72.4,
      "unit": "kg",
      "measuredAt": "2026-05-29T08:00:00.000Z"
    },
    {
      "type": "ACTIVE_CALORIES",
      "value": 430,
      "unit": "kcal",
      "measuredAt": "2026-05-29T08:00:00.000Z"
    }
  ]
}
```

支援的 `type`：

- `STEPS`
- `WEIGHT`
- `ACTIVE_CALORIES`
- `EXERCISE`
- `SLEEP`

成功回應：

```json
{
  "synced": 3
}
```

## 同步狀態 Endpoint

```http
GET /api/health/sync
```

建議使用 Bearer token：

```http
Authorization: Bearer hcs_...
```

成功回應包含最近同步時間、各類型最新值與最近 50 筆資料：

```json
{
  "lastSyncedAt": "2026-05-29T08:10:00.000Z",
  "latestByType": {
    "STEPS": {
      "type": "STEPS",
      "value": 8421,
      "unit": "count",
      "measuredAt": "2026-05-29T08:00:00.000Z"
    }
  },
  "metrics": []
}
```

## 管理同步裝置

列出裝置：

```http
GET /api/health/connections
```

撤銷裝置 token：

```http
DELETE /api/health/connections/{id}
```

## 去重規則

後端用以下欄位去重：

```text
userId + source + type + measuredAt
```

同一筆資料重複同步會更新 value/unit，不會新增重複資料。

## MVP 同步流程

1. Flutter app 使用 AI Food Diary 帳號登入。
2. 呼叫 `POST /api/health/connections` 建立同步 token。
3. 將 `hcs_...` token 存入 secure storage。
4. 要求 Health Connect 權限。
5. 讀取最近 7 天 `STEPS`、`WEIGHT`、`ACTIVE_CALORIES`。
6. 正規化成 API payload。
7. 用 `Authorization: Bearer hcs_...` 呼叫 `POST /api/health/sync`。
8. 呼叫 `GET /api/health/sync` 顯示同步狀態。

## 後續方向

- 增加 NutritionRecord 匯入。
- 將 AI Food Diary 餐點寫回 Health Connect。
- 加入背景同步與同步錯誤重試。
