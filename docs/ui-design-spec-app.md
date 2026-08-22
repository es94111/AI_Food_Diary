# AI Food Diary Android App 移动端 UI/UX 设计规范

> **范围**：仅针对 `mobile/` 下的 Flutter Android 手机原生体验。保留 Web 产品身份，但不缩小 Web 布局；本规范不 redesign Web、不生成生产代码。
>
> **执行模式**：深度模式
>
> **依据**：共享设计系统 + 7 份移动端专家报告 + 现有 Flutter App 代码与 Maestro 流程。

## 1. 总审核结论

AI Food Diary 的 Android App 应从当前「长 Dashboard 承载所有功能」转为：

> **今日工作台 → 快速记录 → AI 可编辑草稿 → 用户确认储存 → 可恢复状态 → 餐点回顾**

视觉上延续暖琥珀、陶土、橄榄和温暖中性色；交互上使用 Material 3、三项底部导航、系统相机/相簿、Bottom Sheet、全屏表单、Android Back、键盘/安全区 Insets。

### 已冻结的移动决策

1. 根导航固定三项：`飲食 / 健康 / 設定`。
2. 不增加「食物」第四 Tab；食物是记录上下文入口，设置中另有管理入口。
3. 今日页只负责今日摘要、主记录行动、待处理任务和餐点回顾；不再嵌入完整输入表单。
4. 来源选择、短筛选、短确认使用 Bottom Sheet。
5. 文字描述、手动记录、复杂 AI 审核、餐点详情/编辑、历史、健康详情、设置子页使用全屏页面。
6. AI 分析完成不等于餐点已储存；`確認並儲存` 是正式记录边界。
7. 本机保留、账号已储存、已同步必须分别表达。
8. Health Connect 授权不是饮食记录前置条件。
9. 关键错误不可只用 SnackBar；长任务必须可从状态中心恢复。
10. 当前 `較推薦 / 普通 / 建議少吃` 不作为用户主要评级；改为中性资料完整度/AI 信心度方向，待产品确认最终算法与文案。
11. 昨日总结不再自动阻塞首次使用；改为今日页或历史页的可召回入口。
12. Android 默认不使用 Web 玻璃、3D、粒子、持续视差或装饰性动态背景。

## 2. 产品定位、用户与成功标准

### 2.1 定位

AI Food Diary 是一款 AI 辅助饮食记录工具：用户可拍照、从相簿选择、描述或手动输入餐点；AI 建立可编辑草稿；用户检查、修改并确认储存；之后回顾餐点、饮水、营养趋势和健康资料。

AI 是助手，不是裁判。产品不提供医疗诊断或治疗建议，不把未经用户确认的 AI 估算写成正式记录。

### 2.2 用户

- **大众日常健康用户**：想低负担知道今天吃了什么，获取简单、非评判式的下一步建议。
- **进阶营养用户**：需要份量、单位、热量、蛋白质、脂肪、碳水、数据来源、趋势和健康同步。

不建立割裂的「简单模式 / 专业模式」；默认摘要优先，详细营养、来源、目标和趋势渐进展开。

### 2.3 JTBD

- 「刚吃完一餐时，我想用最少步骤记录它，并知道记录是否真的储存完成。」
- 「AI 识别不准确时，我想直接修改或改用手动记录，不必重新开始。」
- 「重复吃相同食物时，我想从我的食物快速带入，并调整份量。」
- 「查看健康资料时，我想知道数据来自哪里、何时更新，以及没有授权/没有数据/同步失败的差异。」

### 2.4 可验证成功标准

1. 新用户可完成：登录 → 今日 → 选择记录方式 → AI 草稿 → 修改 → `確認並儲存` → 餐点详情。
2. 相机权限拒绝、用户不想拍照或 AI 失败时，可从同一记录入口进入 `手動記錄`。
3. AI 结果始终显示 `AI 估算・待確認`；确认前不显示为正式餐点。
4. AI/储存失败保留相片、描述、草稿和用户修改；重试不生成重复餐点。
5. 离线时能打开缓存并完成产品已确认的离线策略；界面不伪装服务器已储存。
6. App 被切换、锁屏或重启后，后台分析任务可由今日页、状态中心或通知恢复。
7. 拒绝 Health Connect 后仍可完成饮食记录。
8. 未授权、已授权无数据、数据过期、同步失败、部分授权分别可理解。
9. 键盘、Back、手势导航、刘海、底部系统栏和固定 CTA 不互相遮挡。
10. TalkBack、1.3–1.5 倍字体、深色模式和 Reduced Motion 下，核心 P0 流程仍可完成。

## 3. 信息架构与导航

### 3.1 对象模型

```text
User 用户
└── Day 日期
    ├── Meal 餐点
    │   ├── FoodItem 食物项目
    │   ├── InputSource 输入来源
    │   ├── AIDraft AI 草稿
    │   └── UserConfirmation 用户确认
    ├── DailyFeedback 每日回馈
    └── HealthSummary 健康摘要

StateTask 状态任务
├── AI 分析
├── 餐点储存
├── 离线待同步
├── Health Connect 同步
└── 冲突处理

SavedFood 我的食物
└── 可重复带入的食物模板，不等同历史餐点
```

核心边界：`AI 分析完成 ≠ 餐点已储存`；`本机保留 ≠ 账号已储存 ≠ 已同步`。

### 3.2 根导航

| Tab | 责任 | 不放入的内容 |
|---|---|---|
| `飲食` | 今日、记录入口、AI 草稿、餐点详情、历史、每日回馈、状态中心 | 完整健康指标、所有设置表单 |
| `健康` | Health Connect、健康摘要、饮水、指标详情、趋势、同步记录 | 饮食记录的前置授权 |
| `設定` | 账号、个人/身体资料、我的食物管理、AI、Google、隐私、更新 | 今日餐点主流程 |

`我的食物` 不成为第四 Tab：它既有「记录时选取」也有「设置中管理」两种上下文，不是一个单一长期目的地。需通过任务测试验证入口发现性；批量/长按不得是唯一入口。

### 3.3 逻辑路由树

```text
session.gate
├── auth.login
├── auth.register
└── app.shell
    ├── app.diet.today
    │   ├── app.diet.capture.source          [短 Sheet]
    │   ├── app.diet.capture.photo           [系统相机/相簿]
    │   ├── app.diet.capture.description
    │   ├── app.diet.capture.manual
    │   │   ├── app.diet.foods.select
    │   │   ├── app.diet.capture.barcode      [P2]
    │   │   ├── app.diet.capture.label        [P2]
    │   │   └── app.diet.capture.brand        [P2]
    │   ├── app.diet.analysis.task
    │   ├── app.diet.draft.review
    │   ├── app.diet.meal.detail
    │   │   └── app.diet.meal.edit
    │   ├── app.diet.history
    │   │   ├── app.diet.history.day
    │   │   ├── app.diet.feedback
    │   │   └── app.diet.trends
    │   └── app.diet.status-center
    ├── app.health.overview
    │   ├── app.health.permission
    │   ├── app.health.sync-task
    │   ├── app.health.metric.detail
    │   ├── app.health.water
    │   └── app.health.sync-log
    └── app.settings.home
        ├── app.settings.profile
        ├── app.settings.my-foods
        │   ├── app.settings.my-foods.edit
        │   └── app.settings.my-foods.select
        ├── app.settings.ai
        ├── app.settings.google
        ├── app.settings.privacy
        ├── app.settings.update
        └── app.settings.admin
```

### 3.4 状态中心

状态中心不是第四根导航，而是跨领域任务入口。按用户下一步分组：

1. **待处理**：待确认草稿、储存未完成、权限、冲突。
2. **进行中**：AI 分析、储存、Health Connect 同步。
3. **稍后重试**：待同步、同步失败、分析失败。
4. **已完成**：最近储存、最近同步、已处理任务。

每项显示对象、所属日期、状态、最后更新时间和下一步 CTA。通知关闭后，今日页和状态中心仍必须能找回任务。

## 4. 页面与形态规范

### 4.1 今日工作台 `app.diet.today`

**单栏顺序**：

1. 日期、数据新鲜度和同步入口。
2. 今日热量/宏量摘要，可展开细节。
3. 唯一主行动 `記錄飲食`。
4. AI 分析中、待确认、待同步、失败等持久 Banner。
5. 今日餐点时间线/列表。
6. 饮水摘要、历史和每日回馈入口。

当前 `DashboardScreen._foodTab()` 的完整新增表单、复杂 AI 审核和长篇每日总结必须从首页责任中拆出。首页回答「今天吃了什么、是否储存、下一步是什么」。

空状态：

```text
今天還沒有飲食紀錄
拍照、描述或手動記錄第一餐都可以。
[記錄飲食]
```

离线：

```text
目前離線；以下內容可能不是最新資料。
最後同步：昨天 22:10
```

### 4.2 来源选择 Sheet

标题：`怎麼記錄這餐？`

四项等权：

- `拍照記錄`：拍下餐点，让 AI 协助建立估算草稿。
- `從相簿選取`：使用装置中已有的餐点相片。
- `文字描述`：用几句话描述吃了什么。
- `手動記錄`：直接输入食物与份量。

短 Sheet 支持拖曳、关闭按钮、点遮罩、系统 Back 和底部安全区。P2 的条码、营养标示、品牌搜寻放在手动页「更多资料来源」，不抢 P0 注意力。

### 4.3 文字描述页

全屏单栏；餐别、多行 `餐點描述`、字数提示、AI 说明、底部固定 `開始分析`。

```text
描述這餐
AI 會依照你的描述建立可編輯的估算草稿，儲存前請先確認。

餐點描述
例如：午餐吃了一碗滷肉飯、一顆滷蛋和一杯無糖豆漿。

[開始分析]
```

空白错误：`請先描述你吃了什麼。`

### 4.4 手动记录页

全屏单栏、必要字段优先、营养渐进展开：

- 默认：`餐別`、`食物名稱`、`份量`、`單位`。
- 展开：`熱量`、`蛋白質`、`脂肪`、`碳水化合物`。
- 快速入口：`從我的食物選取`。
- P2：`掃描產品條碼`、`上傳營養標示`、`品牌搜尋`。
- 底部固定：`開始分析`。

字段错误贴近字段，数值字段使用数字键盘并显示单位；保存/分析失败保留全部输入。

### 4.5 AI 分析状态页

上传与分析分开：

```text
正在上傳相片…
AI 正在分析這餐…
整理份量與營養…
```

说明：`已收到你的內容；完成後會先顯示可編輯草稿。`

分析中允许离开；今日页和状态中心持久显示任务。完成显示：`AI 已完成初步估算，尚未儲存。` + `查看草稿`。失败显示：`分析未完成；原始內容已保留。` + `重新分析` / `改用手動記錄` / `稍後處理`。

### 4.6 AI 草稿审核页

复杂审核使用全屏，而不是当前 `_ConfirmSheet` 的长 Sheet。

- 顶部：`AI 估算・待確認`、`尚未儲存`。
- 默认显示：食物名称、份量、热量约值。
- 展开显示：蛋白质、脂肪、碳水、AI 信心度、来源。
- 用户修改显示：`已由你修改`。
- 固定底部 CTA：`確認並儲存`。
- 重新分析必须由用户主动触发，不得静默覆盖手动修改。
- 返回有未保存内容时，Dialog 提供 `繼續編輯`、`保留草稿`、`放棄`。
- 保存失败：`儲存未完成，草稿仍保留。` + `重試儲存`。

### 4.7 餐点详情/编辑/删除

详情全屏单栏：餐别/时间/正式状态 → 相片 → 食物项目 → 营养摘要 → 来源/同步 → `編輯餐點` / `刪除餐點`。

编辑全屏，固定 `儲存變更`；删除 Dialog：

```text
要刪除這筆餐點嗎？
刪除後，這筆內容會從飲食紀錄中移除。
[取消] [刪除餐點]
```

编辑失败保留原记录和用户修改；离线时不得伪装服务器已更新。

### 4.8 历史、每日回馈、趋势

历史使用日期选择器、前后日期和「返回今天的饮食」，不要扩张为多个长期横向 Tab。每日回馈为可召回全屏页或短入口，不自动弹出阻塞今日任务。

事实型反馈：

- `今天已記錄 3 個餐點，熱量約 1,520 kcal。`
- `過去 7 天的記錄中，蛋白質平均約為 85 g。`
- `如果想讓今天的紀錄更完整，可以繼續記錄下一餐。`

边界：`這些內容是個人紀錄與趨勢整理，不是醫療診斷或治療建議。`

### 4.9 健康与 Health Connect

健康 Root Tab 单栏：连接状态、最后同步、今日活动、饮水摘要、可折叠指标分组、同步与日志入口。小屏单列；宽手机最多两列；不要固定三列小卡。

流程：App 说明页 → Android 系统授权 → 回读状态。

必须区分：

- `尚未連結 Health Connect`
- `已連結，但目前沒有可用的健康資料。`
- `資料可能已過期`
- `部分健康資料已同步`
- `同步未完成；上次同步的資料仍保留。`

拒绝授权后仍可完整记录饮食。同步可离开并从状态中心恢复。

### 4.10 设置与我的食物

设置是分组列表：账户与资料、身体与目标、我的食物、AI、健康资料与同步、Google、隐私、通知、更新、管理员、登出。子设置用全屏页。

我的食物分为：

- **选取模式**：从手动记录/审核中搜索、筛选、选择并带回原表单。
- **管理模式**：搜索、最近/常用、排序、编辑、封存、还原、批量操作。

批量操作提供可见 `選取`/Checkbox，长按仅作为快捷方式。封存不影响历史餐点。

## 5. 状态与交互契约

| 状态 | 用户文案 | 必须动作 |
|---|---|---|
| `idle` | `選擇一種方式開始記錄。` | `記錄飲食` |
| `input` | `正在編輯這份餐點。` | 继续、清除、保留 |
| `captured` | `內容已接收；確認後開始分析。` | `開始分析` |
| `uploading` | `正在上傳相片…` | 允许离开、必要时取消 |
| `analyzing` | `AI 正在分析這餐…` | 状态中心、稍后处理 |
| `review` | `AI 估算・待確認` / `尚未儲存` | 编辑、新增、删除、确认 |
| `review-unsaved` | `已由你修改；這些變更尚未儲存。` | 继续或保存 |
| `saving` | `正在儲存餐點…` | 禁止重复提交 |
| `saved` | `已儲存` | 进入详情、编辑、删除 |
| `offline` | `目前離線` / 最后同步时间 | 查看缓存、继续本机流程 |
| `pending-sync` | `已保留在此裝置，待同步` | 查看、立即同步、稍后 |
| `error` | `操作未完成，內容已保留。` | 重试/替代 |
| `permission-required` | `需要授權才能使用這項功能。` | 前往授权 |
| `permission-denied` | `尚未授權；你仍可使用其他記錄方式。` | 前往设置、稍后 |
| `syncing` | `正在同步健康資料…` | 查看范围、离开 |
| `sync-failed` | `同步未完成；資料仍保留。` | 重试、查看详情 |
| `empty` | 页面对象的具体空状态 | 唯一主 CTA |
| `conflict` | `發現較新的版本，請選擇要保留的內容。` | 查看差异、明确选择 |

### Android Back / 手势 / 键盘

- 第一次 Back：输入页收键盘；第二次 Back 才返回页面。
- 有未保存内容：Dialog 提供继续、保留、放弃。
- Sheet：Back、关闭、遮罩、向下拖都可退出；系统 Back 优先关闭最上层 Sheet。
- 日期左右滑、相片横滑、双指缩放、下拉刷新、列表左滑和长按都必须有可见按钮替代。
- 记录与审核使用固定 CTA；键盘出现时 CTA 移到 IME 上方，避让底部手势区与 NavigationBar。
- 焦点顺序遵循页面视觉顺序；中文组合输入不得误触提交；数值使用数字键盘。

### 安全区与尺寸

- 状态栏/刘海/Display Cutout 不放关键文字或按钮。
- `≤359dp`：单列、营养逐项/两列、CTA 可换行。
- `360–411dp`：单列主流程，健康最多两列。
- `412–599dp`：仍是手机单列主流程，不变桌面双栏。
- 短屏约 `≤640dp`：折叠次要说明，CTA 保持可见。
- 横向手机不切换桌面三栏；表单与审核仍单列。

## 6. 视觉系统

### 6.1 品牌概念

视觉记忆点是「暖琥珀确认线 + AI 可确认草稿 + 餐点时间线」。整体像一本可靠但不严肃的随身健康记录本：温暖纸张色背景、自然餐点相片、清晰字段、细边框、不透明卡片、少量陶土/橄榄辅助色。

### 6.2 颜色 Token

共享设计系统的核心值为权威值：

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `brand.primary` | `#B45309` | `#FBBF24` | 主 CTA、选中导航、确认 |
| `brand.hover` | `#92400E` | `#FCD34D` | Web/辅助 pressed 语义，Android 不依赖 hover |
| `brand.pressed` | `#78350F` | `#F59E0B` | pressed |
| `brand.soft` | `#FEF3C7` | `#2A2012` | AI 草稿/轻提示 |
| `accent.terracotta` | `#D96343` | `#ED7E5D` | 食物/生活方式 |
| `accent.olive` | `#596B32` | `#91A360` | 健康辅助强调 |
| `surface.canvas` | `#FDF6EC` | `#14110F` | App 背景 |
| `surface.default` | `#FFFFFF` | `#211C19` | 卡片/内容面 |
| `surface.subtle` | `#F4F1EC` | `#2C2622` | 次级区域 |
| `surface.elevated` | `#FFFDF9` | `#3D342E` | Sheet/Dialog/浮层 |
| `content.primary` | `#292320` | `#F5F0EA` | 主文字 |
| `content.secondary` | `#57534E` | `#B8AFA5` | 辅助文字 |
| `content.tertiary` | `#8A817A` | `#8A7F75` | 说明/时间 |
| `border.default` | `#E9E3DA` | `#3A332E` | 边框 |
| `border.focus` | `#D97706` | `#FBBF24` | 焦点 |

状态：`success #059669/#34D399`、`warning #D97706/#FBBF24`、`danger #E11D48/#FB7185`、`info #0284C7/#38BDF8`，均配对应浅/深色底色。

营养：蛋白质 `#0EA5E9`、脂肪 `#F59E0B`、碳水 `#F43F5E`、饮水 `#0284C7`。只表示分类，不表示好坏，必须配标签、数值或图例。

### 6.3 字体、间距、形状

```yaml
font.sans: "Plus Jakarta Sans, Noto Sans TC, PingFang TC, Microsoft JhengHei, Noto Sans, Arial, sans-serif"
font.mono: "JetBrains Mono, SFMono-Regular, Roboto Mono, Consolas, monospace"
type:
  display: 40sp/44sp 800
  h1: 32sp/38sp 800
  h2: 24sp/30sp 750
  h3: 18sp/24sp 700
  body: 16sp/24sp 450
  body-medium: 16sp/24sp 600
  small: 14sp/20sp 500
  caption: 12sp/16sp 600
  overline: 11sp/14sp 700
spacing: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96]
android.page-gutter: 16dp
minimum-touch-target: 48dp
primary-button-height: 52dp
input-height: 56dp
list-row-min-height: 64dp
radius.field: 14dp
radius.card: 20dp
radius.sheet: 28dp
radius.dialog: 24dp
radius.pill: 9999dp
```

普通卡片用表面与边框区分，不默认阴影；Sheet/Dialog/拖拽对象才使用有限 elevation。Android 使用不透明 Material surface。

### 6.4 组件视觉

- **NavigationBar**：约 80dp + 底部 Insets；三项固定；Material indicator + brand；不使用宏量色。
- **AppBar**：约 64dp；返回按钮 48dp；标题 h3；子页必须有可见返回。
- **AI 草稿**：`brand.soft` + 1dp 品牌边框；顶部 `AI 估算・待确认`；用户修改显示 `已由你修改`。
- **固定 CTA**：表面背景 + 1dp 顶部分隔线 + 52dp 主按钮；保留完整文案。
- **输入框**：56dp 高，有 label、单位、范围、错误和焦点环。
- **Empty/Error/Offline/Sync**：静态、清晰、可行动；不靠颜色单独表达。
- **健康图表**：160–220dp 高；有单位、时间范围、图例和 TalkBack 描述。
- **图标**：Material Symbols Rounded，16/20/24/32/40dp；核心操作不用 Emoji；图标按钮有可读名称。

### 6.5 动效与性能

- pressed 80–120ms；focus 100–160ms；状态 160–200ms；Dialog 180–220ms；Sheet 220–320ms；图表 240–400ms。
- 进入使用淡入 + 4–8dp 位移；不弹跳；AI 用阶段文字、轻骨架，不用无限 Spinner 作为唯一说明。
- Reduced Motion 关闭位移、缩放、抖动、循环脉冲和无限动画，保留静态阶段与文字状态。
- 首屏不加载装饰动态效果；目标 60fps；同时动画区域不超过 2 个；缩略图约 512px；低端设备回退静态 surface、图表和系统转场。
- 不启用 WebGL、Canvas 装饰场景、粒子、Shader、3D、持续视差、鼠标追踪或玻璃拟态。

## 7. 无障碍与隐私

- 触控目标至少 48×48dp；主要 CTA 52dp；列表行至少 64dp。
- 正文对比度至少 4.5:1，大字至少 3:1；状态同时使用文字、图标、结构或标签。
- TalkBack 读出标题、字段、单位、AI 估算、用户修改、储存/同步状态和下一步动作。
- Sheet/Dialog 打开后焦点进入；关闭后回到触发按钮；错误先读摘要再定位第一个错误字段。
- 字体 1.3–1.5 倍时不截断标题、单位、状态和 CTA；长食物名视觉可截断但无障碍需读完整。
- 相片替代文字不能将 AI 不确定结果写成事实：未确认使用「食物內容尚未確認」。
- 通知默认不显示完整餐点、热量或健康细节；通知关闭后状态中心仍可找回任务。
- 相片、饮食、体重、Health Connect 为敏感资料；不进入装饰性日志或调试 UI。

## 8. 实施优先级与复用边界

### P0：先完成记录闭环

1. 三项 Root 导航和子页面返回契约。
2. 今日工作台：日期、摘要、`記錄飲食`、待处理、餐点列表。
3. 来源 Sheet、相机/相簿、描述、手动输入。
4. AI 状态任务与 WorkManager/冷启动恢复。
5. 全屏 AI 草稿审核、用户编辑、`確認並儲存`。
6. 餐点详情、编辑、删除。
7. 空、加载、错误、离线、权限、保存失败和冲突基础状态。
8. 状态中心最小入口。

### P1：持续使用能力

1. 状态中心完整分组、通知和任务恢复。
2. 历史、趋势、每日回馈。
3. Health Connect 授权、同步、部分授权、无资料、过期、失败。
4. 饮水。
5. 我的食物选取器与管理页。
6. 后台恢复、待同步和同步记录。

### P2：增强与高风险设置

条码、营养标示、品牌搜寻、Google 绑定、AI 高级设置、隐私/相片删除导出、更新、管理员、特殊人群提示。

### 现有能力可复用

- `mobile/lib/theme/app_theme.dart`：Material 3、深浅主题、语义色、NavigationBar。
- `mobile/lib/main.dart`：ThemeMode.system、SplashScreen、Sentry。
- 登录/注册、缓存优先、相机/相簿、三种输入、WorkManager、餐点、Health Connect、饮水、我的食物、条码、营养标示、Google、更新等现有能力。
- `.maestro/flows/` 的基础导航、手动记录、我的食物测试基础。

### 不应直接沿用

- `DashboardScreen` 把所有功能塞入长滚动。
- `meal_capture_form.dart` 将复杂输入和 AI 审核长期嵌在首页/Sheet。
- SnackBar 作为 AI、保存、同步关键状态的唯一载体。
- `daily_summary_popup.dart` 自动阻塞首次任务。
- `health_sync_card.dart` 的小屏三列密集指标作为固定方案。
- `saved_foods_manager.dart` 只用长按批量操作。
- 当前负面 AI 评级。
- 现有 Maestro 基础流程替代离线、权限、TalkBack、大字、恢复和冲突验收。

## 9. 测试与验收矩阵

### P0 Maestro

- 今日 → 来源 → 手动。
- 拍照 → AI → 全屏审核 → 修改 → 确认储存 → 详情。
- AI 完成但尚未储存。
- AI 失败并改手动。
- 相机/相簿权限拒绝、取消、超过 5 张、读取失败。
- 保存失败恢复，连续点击不重复。
- 离线记录、待同步、网络恢复。
- 分析中切换 Tab、锁屏、结束 App、冷启动恢复。
- 通知权限拒绝后从状态中心恢复。
- Health Connect 拒绝、部分授权、无数据、过期、同步失败。
- 多设备冲突不可静默覆盖。

### Widget/手动验收

- default/pressed/focused/selected/disabled/loading/success/error。
- 字段错误与第一个错误焦点。
- 键盘打开时固定 CTA 可见。
- 1.5 倍字体、深色模式、Reduced Motion。
- Sheet/Dialog 焦点进入与返回。
- 我的食物选取与管理模式、可见批量选择。
- 刘海、手势导航、三键导航、短屏、窄屏、横向。
- TalkBack 完成 P0 流程和动态状态读出。
- 敏感资料不出现在通知和日志。

## 10. 冲突处理记录

| 冲突 | 总审核决策 | 依据 |
|---|---|---|
| 需求摘要曾写「AI 审核 Sheet/全屏」 | 复杂多项目审核统一全屏；Sheet 仅短任务 | 共享规范、形态、Android Bottom Sheet 参考 |
| `記錄飲食` 与 `記錄餐點` 混用 | 根级统一 `記錄飲食`；指定餐别上下文才可用 `記錄餐點` | 内容报告可发现性与术语统一 |
| 用户选「完整 App」但 P0/P1/P2 分层 | 规范覆盖完整 App；实施按 P0 → P1 → P2 | 降低首版复杂度且不缩小产品范围 |
| 现有自动昨日 Dialog | 改为今日/历史页内可召回入口，不阻塞首次任务 | 移动任务优先、交互/形态报告 |
| 现有 AI 负面评级 | 移除主要负面评价，改中性资料完整度/AI 信心度；算法待确认 | 共享非评判原则 |
| 当前 SnackBar/局部 Banner | 关键长任务进入持久状态 Banner/状态中心；SnackBar 只补充 | 状态契约、离线/同步研究 |
| 当前健康三列指标 | 小屏单列、宽手机最多两列并渐进展开 | 手机信息密度与无障碍 |
| 当前长按批量食物 | 提供可见 `選取`/Checkbox；长按为快捷方式 | 触控发现性与可访问性 |

## 11. 待产品确认问题

1. 离线是否允许确认并储存正式餐点？草稿与待同步任务保存多久？
2. `已保留在此装置`、`已儲存`、`已同步` 的正式数据定义是什么？
3. 多设备冲突采用本机、账号、字段合并还是保留副本？
4. AI 信心度是否逐项显示？分级门槛是什么？
5. 营养值能否直接编辑，还是只编辑份量后自动重算？
6. 手动输入资料完整时是否可跳过 AI 分析？
7. 当前评级是否完全移除，还是改为资料完整度/信心度？
8. 相片是否发送第三方 AI 服务、保存多久、如何删除/导出？
9. Health Connect 读取/写回哪些数据、历史回填范围、同步频率是什么？
10. AI 完成、保存失败、同步失败的通知默认策略是什么？通知拒绝后多久在 App 内提醒？
11. 每日回馈是主动打开、每日首次打开非阻塞提示，还是通知触发？
12. 台湾繁中、kg/kcal/mL、时区和日期是否固定，还是跟随设备？
13. 深色模式是否全 App 跟随系统？最低 Android 版本和目标设备范围？
14. Google 是登录、附加绑定，还是两者都支持？
15. 条码/营养标示/品牌搜寻的正式上线时机？
16. 我的食物只封存还是允许删除？删除对历史关联如何表达？
17. 是否纳入特殊饮食、过敏原、孕期、儿童等提示？
18. 是否正式支持横向手机与三键导航模式？

## 12. 参考与追溯

### 仓库事实

- `README.md`
- `docs/ui-design-system-shared.md`
- `mobile/lib/main.dart`
- `mobile/lib/theme/app_theme.dart`
- `mobile/lib/screens/dashboard_screen.dart`
- `mobile/lib/widgets/meal_capture_form.dart`
- `mobile/lib/widgets/daily_summary_popup.dart`
- `mobile/lib/widgets/health_sync_card.dart`
- `mobile/lib/widgets/saved_foods_manager.dart`
- `mobile/pubspec.yaml`
- `mobile/.maestro/flows/smoke_dashboard_nav.yaml`
- `mobile/.maestro/flows/add_manual_meal.yaml`
- `mobile/.maestro/flows/saved_foods_nav.yaml`

### 外部参考

- Android Navigation Bar：https://developer.android.com/develop/ui/compose/components/navigation-bar
- Android Bottom Sheets：https://developer.android.com/develop/ui/compose/components/bottom-sheets
- Google Open Health Stack Offline & Sync：https://developers.google.com/open-health-stack/design/offline-sync-guideline
- Veri AI Meal Logging：https://tonjrv.com/Work/MealLogging
- Mobbin：https://mobbin.com
- 60fps.design：https://60fps.design
- UI Pocket Mobile：https://www.ui-pocket.com/mobile

TinyFish 是用户选择的搜索方式，但当前环境没有 TinyFish MCP 工具；已使用等效 Web 搜索和网页抓取。React Bits Magic Bento 读取失败，未纳入规范依据。Awwwards、Godly、Supahero、Pinterest 仅作为“不要将营销页视觉搬进原生 App”的反例，不作为 Android 规范依据。

### 外部技能

已使用项目内 `ui-workflow` 协议、`design-dna` 的结构指导和 Android/Material 3/移动端内建质量清单。`ehmo/platform-design-skills`、`ceorkm/mobile-app-ui-design`、`ux-audit`、`copywriting` 等第三方技能未调用或未安装；缺失不阻塞流程。

## 13. 本轮不包含

- 不修改 `mobile/`、`src/`、依赖、配置、数据库或后端。
- 不重做 Web UI。
- 不生成 HTML 原型、Flutter 生产组件或 Figma 文件。
- 不冻结离线数据模型、冲突算法、Health Connect 具体数据范围、AI 信心度算法或相片保存政策；这些仍需产品确认。

**当前产物是移动端设计规范，不是实现变更。**
