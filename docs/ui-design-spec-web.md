# AI Food Diary Web UI 设计规范

> **范围**：仅 Web application（桌面 Web、平板 Web、移动 Web）
> **执行模式**：深度模式
> **设计基础**：`docs/ui-design-system-shared.md`  ￼
> **事实代码路径**：仓库没有 `web/` 目录；现有 Web 位于 `src/app/` 与 `src/components/`。
> **本轮约束**：不设计原生 Android/Flutter Mobile App；不修改生产代码；不生成 HTML 原型。

## 1. 产品与用户背景

AI Food Diary 是一个桌面优先、响应式的 AI 辅助饮食与健康记录 Web 工作台，核心闭环是：

```text
记录餐点 → 检查 AI 分析草稿 → 修正 → 确认并储存 → 回顾趋势与下一步
```

### 目标用户

- **大众日常健康用户**：需要低负担记录、快速理解今天的进度和简单下一步；默认只看到摘要，不能被营养术语或长表单阻塞。
- **健身/营养进阶用户**：需要桌面高信息密度、份量与营养编辑、历史趋势、筛选、排序、批量管理和资料来源。
- **低频管理用户**：使用 AI 设置、连接、版本或管理员区域；不应干扰普通用户的工作台。

两类主要用户不拆成两套 UI；使用同一资料模型，以摘要优先、详情渐进展开和密度模式满足差异。

### 产品承诺

1. 记录低负担：相片、描述、手动和我的食物进入同一记录路径。
2. AI 可审阅：AI 只产生可编辑估算，用户确认后才成为正式餐点。
3. 状态可恢复：分析、储存、离线、待同步、冲突和失败都明确表达且可行动。
4. 温暖可信：台湾繁体中文、非医疗化、不以羞耻感驱动。
5. Web 平台化：桌面使用侧栏、表格、键盘和高密度工作区；平板/移动 Web 有独立降级规则。

## 2. 设计目标与范围

### 本轮包含

- 桌面优先信息架构、侧栏、顶部辅助区、主工作区和可选辅助面板。
- 今日饮食、历史/趋势、AI 草稿审核、餐点详情、健康概览、饮水、我的食物、设置、状态中心。
- Dashboard、语义表格、筛选/排序/批量、表单、Drawer、Dialog、键盘、hover/focus。
- 桌面/平板/移动 Web 响应式行为。
- Light/Dark Web 主题、共享色彩、字体、间距、语义色与品牌身份。
- Loading、empty、error、success、offline、pending-sync、conflict 和 accessibility 规范。

### 本轮不包含

- Flutter/Android 原生页面、底部导航、原生相机、原生权限或原生手势。
- Health Connect 原生授权和同步实现。
- 后端 API、数据库、离线同步引擎、冲突算法、依赖升级或生产代码。
- 医疗诊断、治疗建议、社交、积分、排行榜或强游戏化。
- 未确认的条码、品牌、信心度、资料导出、离线跨设备恢复等功能承诺。

## 3. 页面与流程总览

### P0 核心闭环

1. `/login`、`/register` 与认证壳层。
2. `/dashboard` 今日饮食工作台。
3. 照片、描述、手动新增餐点。
4. AI 分析草稿、编辑、重新分析、确认并储存。
5. 餐点详情、编辑、删除、再次记录。
6. AI、验证、储存、网络失败的持久恢复。
7. Web shell、状态指示、键盘与焦点基础能力。

### P1 长期使用

1. 日/周/历史与营养趋势。
2. 健康概览、资料来源、最后更新、过期与同步状态。
3. 饮水摘要与快速记录。
4. 我的食物搜索、筛选、排序、批量封存/还原、冲突。
5. 状态中心：待确认、保存失败、待同步、冲突和最近完成。
6. 个人资料、目标、时区和基本设置。

### P2 增强与低频区域

条码/营养标示/品牌增强、AI 服务商、Google 绑定、隐私/导出/删除、管理员、版本/Android 下载、非关键视觉 polish。P2 不应挤压 P0 记录闭环。

## 4. 信息架构与导航

### 4.1 桌面 Web 导航

```text
AI Food Diary
├── 飲食
│   ├── 今日饮食
│   └── 历史与趋势
├── 健康
│   └── 健康概览
├── 食物
│   └── 我的食物
├── 状态中心
└── 設定
    ├── 个人资料
    ├── AI 设置
    ├── 连接与资料状态
    ├── 隐私与资料
    └── 版本与其他
```

- 保留共享设计系统的四个核心领域语义：饮食、健康、食物、设置。
- 历史/趋势属于饮食领域，不提升为新的独立领域。
- 状态中心是跨领域的恢复入口，独立于设置。
- `新增餐点`/`记录饮食` 是侧栏独立主 CTA，不是资料型导航。
- 侧栏 active 不只靠颜色，需有文字、结构或 active indicator。
- 状态中心可显示未处理数量，但必须同时提供文字和可进入的链接。

### 4.2 Topbar

Topbar 不再承担完整一级导航，包含：

- 跳过链接、面包屑、页面标题。
- 日期或日期范围上下文。
- `Ctrl/Cmd+K` 全域搜索。
- 离线/同步/冲突状态入口。
- 主题/显示偏好。
- 使用者菜单：个人、设置、登出。

面包屑示例：

- `飲食 / 今日饮食`
- `飲食 / 历史与趋势 / 选定日期`
- `飲食 / 待确认 / AI 草稿`
- `食物 / 我的食物 / 食物详情`
- `設定 / AI 设置`

面包屑不取代可见返回按钮；移动 Web 可压缩为返回按钮 + 当前标题。

### 4.3 路由策略

继续兼容现有：

- `/login`
- `/register`
- `/dashboard`
- `/dashboard/health`
- `/dashboard/foods`
- `/dashboard/settings`
- `/dashboard?date=YYYY-MM-DD&view=day|week`

渐进式 canonical 建议：

- `/dashboard/history`
- `/dashboard/meals/new`
- `/dashboard/reviews/[draftId]`
- `/dashboard/meals/[mealId]`
- `/dashboard/status`
- `/dashboard/search`
- `/dashboard/settings/profile`
- `/dashboard/settings/ai`
- `/dashboard/settings/integrations`
- `/dashboard/settings/privacy`
- `/dashboard/settings/about`

旧路径和 `date/view` 参数不能因视觉重组而失效。新路由应保留日期、筛选、排序和来源上下文；桌面详情可用 Drawer 表现，但仍绑定详情 URL；移动 Web 使用完整详情页或全屏层。

### 4.4 对象模型

```text
User
├── Day（用户时区日期聚合）
│   ├── Meal
│   │   ├── FoodItem
│   │   ├── InputSource
│   │   ├── AIDraft
│   │   └── Confirmation/SaveState
│   ├── WaterLog
│   └── DailyFeedback
├── FoodAsset
├── HealthSummary
├── SyncTask
└── Settings
```

`AIDraft` 是可编辑但未确认的估算；`Meal` 在用户确认后成为正式记录；`FoodAsset` 可重复使用但不能未经确认直接写入餐点；`SyncTask` 绑定对象、状态、更新时间和 CTA，状态中心只是聚合入口。

## 5. Web Shell 与页面形态

### 5.1 桌面布局

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Workspace Topbar：标题/面包屑/日期/搜索/同步/主题/用户               │
├───────────────┬───────────────────────────────────┬─────────────────┤
│ Primary       │           Main Workspace          │ Auxiliary Panel  │
│ Sidebar       │  页面摘要 / 主要操作 / 表格 / 图表 │ 饮水 / 同步 / AI  │
│ 今日          │                                   │                 │
│ 历史          │                                   │                 │
│ 健康          │                                   │                 │
│ 食物          │                                   │                 │
│ 状态中心      │                                   │                 │
│ 设置          │                                   │                 │
└───────────────┴───────────────────────────────────┴─────────────────┘
```

- 桌面 gutter 32px；不要继续全局使用 `max-w-3xl`。
- 主工作区用 `minmax(0, 1fr)`，侧栏固定，主区是主要滚动区。
- 避免多个独立滚动容器；表格必要时局部横向滚动，但核心字段和主要 CTA 不可被隐藏。
- 右侧辅助面板只显示当前上下文：今日饮水/状态、AI 说明、选定日期详情，不重复主区全部数据。

### 5.2 页面形态

| 页面 | Web 形态 | 关键关系 |
|---|---|---|
| 今日饮食 | Dashboard：摘要 + 餐点节奏线 + 辅助栏 | 卡片摘要、时间线记录、辅助状态 |
| 历史与趋势 | 日期筛选 + 趋势图 + 语义表格 | 图表看趋势、表格做比较、详情做深入 |
| 新增餐点 | 路由化 Capture Workspace | 照片/描述/手动；不使用长 Dialog |
| AI 审核 | 双栏 Review Workspace | 来源/编辑区 + AI 说明/状态 |
| 餐点详情 | 桌面 Drawer；移动完整页 | 保留列表上下文；编辑时进入 dirty |
| 健康 | 来源状态 + 指标网格 + 趋势 | 先可信度/更新时间，再解释数据 |
| 饮水 | 今日辅助模块 | 高频、低复杂度，不占一级导航 |
| 我的食物 | 搜索/筛选工具列 + 语义表格 + 详情 Drawer | 支持比较、批量、冲突 |
| 状态中心 | 状态分组列表/表格 + 恢复 CTA | 不是技术日志，不复制业务对象 |
| 设置 | 设置内导航 + 内容表单 | 一般设置、隐私、管理员、高影响操作分离 |

### 5.3 今日饮食首屏顺序

1. 日期、日/周、前后日期、`记录饮食`。
2. 今日摘要：热量、宏量、饮水、记录数量和待处理状态。
3. 待确认草稿、储存失败、待同步等需要处理事项。
4. 餐点节奏线和摘要列表。
5. 每日反馈、周回顾和计算说明渐进展开。

每日总结从现有 `DailySummaryPopup` 改为非阻塞辅助面板或状态入口，不在用户进入今日页时强制打断记录。

### 5.4 AI Review

```text
原始输入（相片/描述）
→ AI 估算・待确认
→ 可编辑食物/份量/营养
→ 用户修改标记
→ 重新分析（说明覆盖范围）
→ 确认并储存
→ 已储存 / 待同步 / 储存失败 / 冲突
```

- 桌面：来源/编辑主区 + AI 说明/状态辅助区。
- 平板：上下分区；辅助区改抽屉。
- 移动 Web：单栏；固定操作栏避让键盘与浏览器底部。
- 保存失败不关闭页面、不清空输入；重分析默认不覆盖已由用户修改的字段。

### 5.5 我的食物表格

默认列：选择、食物名称、品牌、每份份量、热量/营养摘要、来源、最后更新、状态、操作。

工具列：

```text
[搜寻食物名称或品牌] [收藏] [条码] [不完整] [可能重复] [排序]
[已选 N 笔] [批次封存] [清除筛选]                         共 N 笔
```

使用真实 `table/thead/tbody/th scope`；活动筛选以 chips 显示；桌面 sticky header、必要时固定首列；移动 Web 只保留名称、核心值、状态、主要动作，其他内容进入详情。

## 6. Responsive Behavior

| 视窗 | Shell | 主/辅助 | 表格 | AI Review | 层与操作 |
|---|---|---|---|---|---|
| 360px | 顶部工具列 + 导航抽屉 | 单栏，辅助下移 | 优先列，详情全屏 | 单栏堆叠 | 长 Dialog 全屏；固定底部操作栏并留底距 |
| 768px | 折叠侧栏/抽屉 | 单主栏，辅助 Drawer | 少量优先栏位，不缩小字体 | 上下分区 | 中宽 Drawer；操作栏可换行 |
| 1024px | 窄侧栏或可展开 | 主栏优先，辅助收起 | 优先列 + 次要横向查看 | 主编辑 + 窄辅助或堆叠 | 长编辑转独立页 |
| 1280px | 持久侧栏 | 主栏 + 辅助栏 | 完整语义表格、sticky、批量 | 双栏工作区 | 桌面 Drawer |
| 1440px | 完整侧栏 | 主区扩展 + 辅助 | 比较字段、批量、详情入口 | 来源/编辑/辅助并行 | 层级清楚，不填满空白 |

共同要求：360/768/1024/1280/1440 无非预期横溢；主要触控目标 48px；移动不依赖 hover；输入框被键盘遮挡时自动滚入可视区；固定栏不遮挡错误/保存；浏览器返回与可见返回按钮都有效。

## 7. Visual System

### 7.1 Visual concept

**Warm Evidence Desk（暖炭色的证据型饮食工作台）**：暖米画布提供食物温度，炭色和严格网格提供可信度，amber/terracotta/olive 保留品牌和生活感，macro 色只做资料分类。

唯一记忆点：**Meal Rhythm Rail（餐点节奏线）**。仅用于今日/历史时间线，用静态节点和文字标签表达时间关系；selected 用 amber，AI 草稿用 terracotta/amber 外圈；不持续动画、不只靠颜色。

### 7.2 Shared Web tokens

#### Surface / content / brand

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `surface.canvas` | `#FDF6EC` | `#14110F` | 应用画布 |
| `surface.scaffold` | `#FAF8F5` | `#14110F` | 页面背景 |
| `surface.default` | `#FFFFFF` | `#211C19` | 卡片/表单/表格 |
| `surface.subtle` | `#F4F1EC` | `#2C2622` | 次级区块/表头 |
| `surface.elevated` | `#FFFDF9` | `#3D342E` | Drawer/Dialog/Popover |
| `content.primary` | `#292320` | `#F5F0EA` | 标题/正文/数字 |
| `content.secondary` | `#57534E` | `#B8AFA5` | 辅助文字 |
| `content.tertiary` | `#8A817A` | `#8A7F75` | 时间/非核心说明 |
| `border.default` | `#E9E3DA` | `#3A332E` | 默认边框 |
| `border.strong` | `#D6D0C7` | `#4A413A` | 选中/强分隔 |
| `brand.primary` | `#B45309` | `#FBBF24` | 主 CTA/active |
| `brand.hover` | `#92400E` | `#FCD34D` | Web hover |
| `brand.pressed` | `#78350F` | `#F59E0B` | pressed |
| `brand.soft` | `#FEF3C7` | `#2A2012` | AI 草稿/轻提示 |
| `accent.terracotta` | `#D96343` | `#ED7E5D` | 食物/生活方式 |
| `accent.olive` | `#596B32` | `#91A360` | 健康/稳定/比较 |

#### Status / macro

| Token | Light 主色/底色 | Dark 主色/底色 | 语义 |
|---|---|---|---|
| `status.success` | `#059669/#ECFDF5` | `#34D399/#0E2A1E` | 已储存/同步完成 |
| `status.warning` | `#D97706/#FFFBEB` | `#FBBF24/#2A2012` | 待确认/资料不足 |
| `status.danger` | `#E11D48/#FFF1F2` | `#FB7185/#2E1416` | 真错误/删除/不可恢复 |
| `status.info` | `#0284C7/#F0F9FF` | `#38BDF8/#0E2230` | 说明/同步/权限 |
| `macro.protein` | `#0EA5E9/#E0F2FE` | `#38BDF8/#102F43` | 蛋白质类别 |
| `macro.fat` | `#F59E0B/#FEF3C7` | `#FBBF24/#3A2B0D` | 脂肪类别 |
| `macro.carbs` | `#F43F5E/#FFE4E6` | `#FB7185/#3A1720` | 碳水类别 |
| `macro.water` | `#0284C7/#E0F2FE` | `#38BDF8/#102F43` | 饮水类别 |

状态和 macro 颜色必须搭配文字、图标、数值、线型或图例；不得使用绿色/红色表示营养好坏或目标失败。

#### Typography / spacing / shape

```yaml
font.sans: "Plus Jakarta Sans, Noto Sans TC, PingFang TC, Microsoft JhengHei, Noto Sans, Arial, sans-serif"
font.mono: "JetBrains Mono, SFMono-Regular, Roboto Mono, Consolas, monospace"
type:
  display: 40/44 800
  h1: 32/38 800
  h2: 24/30 750
  h3: 18/24 700
  body: 16/24 450
  body-medium: 16/24 600
  small: 14/20 500
  caption: 12/16 600
  overline: 11/14 700
  metric: 28/32 750
spacing: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96]
page-gutter.web: 32px
page-gutter.tablet: 24px
page-gutter.mobile: 16px
minimum-target: 48px
radius.field: 14px
radius.card: 20px
radius.drawer-dialog: 24px
radius.pill: 9999px
focus-ring: "0 0 0 3px rgba(217,119,6,0.24)"
```

数字和表格使用 `tabular-nums`；繁体 fallback 可换行；文字放大 1.3–1.5 倍不截断 CTA、状态和单位。

### 7.3 Components

- `Button`：14px radius；hover 100–160ms；pressed 80–120ms；focus 3px；loading 保留文字；success 具体说明；error 提供重试。
- `Input/AI Field`：label、单位、帮助、错误；AI 预填用 brand.soft + `AI 估算`；用户修改显示 `已由你修改`。
- `Card`：20px、实色表面+边框；摘要一卡一重点；不建立卡片墙。
- `Table`：真实语义 table、sticky header、筛选 chips、结果数、清除全部、批量栏、移动优先列。
- `Drawer`：24px、elevated surface、scrim、焦点进/循环/回焦；单笔详情或短编辑。
- `Dialog`：只用于删除、冲突、离开未保存、高影响设置；不承载新增/AI 长流程。
- `Iconography`：Lucide/圆角线性图标，16/20/24/32/40px，图标按钮至少 48px，有 accessible name；不使用 emoji 做核心导航或状态。

### 7.4 Data visualization

- 热量主线 amber；比较/平均线 olive；注记 terracotta；目标/基准灰色虚线；网格低对比。
- Macro 颜色只表达类别；图表同时有名称、数值、单位、图例、线型/点型。
- 目标差距用 `目前记录 80 / 120 g`、`与目标的差距`，不使用红绿评分。
- 每图提供文字摘要和可展开数据表；Tooltip 不是唯一数值来源。
- 无资料、筛选无结果、加载、过期、局部错误独立表达。

## 8. Interaction System

### 8.1 Unified state contract

```text
idle → input → captured → uploading → analyzing → review → review-unsaved → saving → saved
                                                     ↘ error / offline / pending-sync / conflict
```

另有 `permission-required`、`permission-denied`、`syncing`、`sync-failed`、`empty`。

每个状态都要回答：发生什么？资料在哪一层？用户下一步做什么？关键状态持久存在页面、Banner 或状态中心，不能只靠 Toast。

### 8.2 Loading/empty/error/success

- 内容区域使用 skeleton；离散按钮使用 spinner；AI 使用阶段文字 + skeleton，不用无限 spinner 作为唯一说明。
- 首次空、筛选空、系统错误、未授权、已授权无数据、过期和同步失败分开。
- 错误三段式：发生什么 → 资料是否保留 → 下一步。
- 局部 panel 失败不打垮整个 Dashboard。
- 保存失败：`储存未完成，这份草稿仍保留。` + `重试储存`。
- 冲突：`发现其他版本，请查看差异后选择`；不自动覆盖。

### 8.3 Keyboard contract

| 快捷键 | 功能 | 限制 |
|---|---|---|
| `Tab/Shift+Tab` | 前后移动 | Drawer/Dialog 内循环 |
| `Enter` | 触发按钮/链接/选项 | 遵循当前控件语义 |
| `Space` | checkbox/switch/option | 不产生意外提交 |
| `Esc` | 关闭 Popover/Drawer/Dialog | dirty 先确认 |
| `Ctrl/Cmd+K` | 全域搜索 | 输入/编辑/层内不误触发 |
| `N` | 新增餐点 | 输入框/编辑器聚焦时不触发 |
| `Ctrl/Cmd+S` | 储存当前 dirty 草稿/设置 | 只在有保存能力时拦截 |

Shell 顺序：跳过链接→Logo/回今日→主导航→新增→Topbar→标题/主 CTA→日期筛选→主资料→辅助区。路由切换焦点进入新页面标题；Drawer/Dialog 打开焦点进、Tab 循环、Esc 关闭、关闭回触发元素。

### 8.4 表格/筛选

- 真实 `table/thead/tbody/th scope`，默认不使用 ARIA grid。
- 排序表头显示字段和方向；选择后朗读 `已选取…目前选取 N 笔`。
- 不同筛选类别 AND，同类 OR；活动条件以可移除 chips 显示；有数量和 `清除筛选`。
- 结果更新时旧结果保留到新结果准备好；游标失效提示重新载入，不静默改变条件。
- 批量操作只作用当前筛选中明确选取对象。

### 8.5 Pointer/Touch Web

- hover 仅桌面增强；不依赖 hover、滑动删除、长按、双指、旋转或拖曳完成核心任务。
- 触控目标至少 48×48px，相邻至少 8px。
- 移动固定操作栏必须预留底部空间；虚拟键盘开启时字段自动滚入可见区，操作栏不遮挡错误和主要按钮。
- 桌面/平板 Drawer；移动 Web 详情用全页/全屏；浏览器返回和可见返回都可用。

### 8.6 Motion

- Hover/Focus 100–160ms；Pressed 80–120ms；状态 160–200ms；Dialog 180–220ms；Drawer 220–320ms；图表 240–400ms。
- `prefers-reduced-motion` 关闭位移、缩放、抖动、循环、自动播放；保留文字和静态状态。
- 禁止 3D、粒子、shader、视差、鼠标追踪、彩虹边框、持续品牌动画、失败抖动。

## 9. Accessibility

- 正文/背景至少 4.5:1，大字至少 3:1；Light/Dark 分别验证。
- 使用 `header/nav/main/aside`、唯一 `h1`、真实链接、label、单位、帮助文本。
- 字段错误使用 `aria-invalid`、`aria-describedby`；顶部错误摘要链接对应字段，首错聚焦。
- 状态用文字 + 图标 + 结构；不只用颜色、数字或图示。
- `aria-live=polite` 用于筛选数量、AI 完成、成功、局部载入；`assertive`/持久 banner 用于保存失败、离线和冲突；避免重复朗读。
- 图表有标题、期间、系列、单位、当前/平均/目标、趋势摘要和可展开语义数据表。
- 200%/400% 缩放和 1.3–1.5 倍文字不丢功能；移动 Web 不要求核心表单双向滚动。
- 重要错误不只 Toast；敏感健康数值、原图、凭证不进入不必要的公告、URL 或日志。
- reduced motion、高对比度模式、键盘和触控目标纳入验收。

## 10. Content and Copy System

### 10.1 统一用词

- `饮食纪录`、`餐点`、`食物项目`、`相片`、`相簿`、`营养标示`、`饮水`、`我的食物`。
- `AI 分析草稿`、`AI 估算`、`AI 估算・待确认`、`已由你修改`。
- `已储存`、`已在此装置保留`、`待同步`、`已同步`、`同步未完成`、`状态中心`。
- 统一使用「储存」，后续实现需对现有代码中的 `保存`/`儲存` 混用做文案审查。

### 10.2 核心 CTA

`记录饮食`、`拍照记录`、`从相簿选取`、`手动记录`、`开始分析`、`检查 AI 分析草稿`、`编辑内容`、`重新分析`、`改用手动记录`、`确认并储存`、`重试储存`、`立即同步`、`查看待确认`、`稍后处理`、`新增食物`、`编辑餐点`、`删除餐点`、`返回今天的饮食`。

### 10.3 核心 AI 文案

- 分析中：`正在分析这张相片…`
- 完成：`AI 已完成初步估算。请检查食物与份量，再储存这份纪录。`
- 标签：`AI 估算・待确认`
- 修改：`已由你修改；储存时会以你输入的内容为准。`
- 无法辨识：`目前无法辨识这张相片中的食物。可以重新拍摄，或改用手动记录。`
- 过敏：`AI 无法确认食物是否含有过敏原。请以食品包装标示或专业建议为准。`
- 健康边界：`这些内容是个人纪录与趋势整理，不是医疗诊断或治疗建议。`

## 11. Implementation Notes

本规范是设计交接，不要求本轮实现。建议按以下顺序拆分：

1. `src/app/dashboard/layout.tsx`：从窄 `max-w-3xl` 工作台改为 AppShell、侧栏、Topbar、主/辅容器；保留 auth guard。
2. `src/components/dashboard-nav.tsx`：保留领域和 URL 语义，重组为 PrimarySidebar。
3. 今日页：拆分页面上下文、摘要、Meal Rhythm Rail、餐点时间线、状态入口、饮水和非阻塞反馈。
4. `MealCaptureForm`：先冻结草稿状态，再分离 Capture Workspace 与 Review Workspace；保持现有 API 和输入能力。
5. `MealList`：摘要列表 + 桌面详情 Drawer/移动详情页；补充 dirty、删除、重复记录语义。
6. `saved-foods-manager.tsx`：Filter Bar、语义表格、批量栏、详情 Drawer、冲突 Dialog。
7. 健康页：来源/更新时间/状态优先；图表提供文字和表格替代；局部失败独立。
8. 设置页：分组导航和独立保存状态；高影响操作与管理员权限隔离。
9. 状态中心：先定义跨页面状态对象、状态来源、对象 ID、更新时间和 CTA，再做页面。
10. 主题：实现 Light/Dark 语义 token 后再评估现有 glass、环境光和 iridescent 的限制。

### 迁移边界

- 不改变共享领域名、AIDraft/Meal/FoodItem 的状态含义或 AI 确认边界。
- 不在 Web 中复制 Android 底部导航或原生权限流程。
- 不在本轮为未确认的完整离线、冲突算法、AI 信心度、照片保存期限编造实现承诺。
- 保持旧路由与查询参数，避免一次性维护新旧两套页面逻辑。

### 性能

- 内容 skeleton、动作 spinner；图片预留比例；表格骨架稳定列宽；固定栏预留空间。
- Glass 只限侧栏/辅助/轻浮层，并有不透明 fallback。
- 历史/食物/状态中心预留游标/载入更多；未有基线前不强制虚拟列表。
- 图表按需载入、不自动播放；筛选/排序/选择不阻塞输入。

## 12. 冲突处理记录

| 冲突 | 最终决策 | 依据 |
|---|---|---|
| 共享四领域 vs 形态报告将历史列成一级 | 保留四领域；历史归入饮食；状态中心独立跨领域 | 共享 IA、用户可发现性与扩展性 |
| 现有窄容器/玻璃 vs 桌面高密度 | Shell 扩宽；Glass 限于导航/辅助/浮层；表格/表单用实色面 | 用户选择高密度、研究与视觉报告 |
| 现有 DailySummaryPopup vs 非阻塞体验 | 改为非阻塞辅助面板/状态入口，不打断记录 | 需求的 P0 闭环与交互/形态报告 |
| `/dashboard?view=week` vs `/dashboard/history` | 旧参数保留；history 作为渐进 canonical 建议 | 兼容性与渐进迁移 |
| 现有 emoji capture labels vs Web 品牌/无障碍 | 后续改为图标+文字，emoji 不做核心导航/状态；本轮不改代码 | 视觉/无障碍约束 |
| “保存”与“储存”混用 | Web 规范统一“储存”；现有实现需另行做文案审查 | 台湾繁体中文内容规范 |
| Dark mode 共享文档待确认 vs 用户选择纳入 | 本轮定义 Light/Dark Web token 与行为；上线范围仍需产品确认 | 用户明确选择纳入设计 |
| AI 信心度是否显示 | 不默认显示百分比；只有算法/分级冻结后显示高/中/低 | 需求、内容与信任风险 |

## 13. Risks, Assumptions and Follow-ups

### 主要风险

- AI 过强完成感导致跳过确认。
- 红色/评分/临床式标签引发健康焦虑或医疗误解。
- 当前代码尚未证明具备完整离线、幂等、跨装置冲突与草稿持久化能力。
- 高密度桌面在 1024px 附近压缩主栏；移动表格和 AI 双栏易溢出。
- 当前 `color-scheme: light`、动态 glass/iridescent 需要深色和性能验证。
- 健康、相片、体重和 AI 输入是敏感资料；不应在 URL/日志/状态文案泄漏。

### 待确认事项

1. AI 草稿是否有稳定 ID；是否支持刷新、跨装置恢复。
2. Web 离线范围：缓存读取、本机草稿，或完整离线新增/同步。
3. 保存幂等、冲突解决的字段级/整笔规则。
4. 深色主题默认跟随系统还是手动覆盖，及正式上线范围。
5. Logo、品牌资产、字体授权和字体加载策略。
6. AI 信心度算法、分级、是否逐项展示；营养值可编辑范围。
7. Health Connect Web 展示范围、过期规则、来源和更新时间。
8. 相片保存、第三方 AI、删除和导出政策。
9. 目标/时区/日期/单位的权威来源。
10. 我的食物封存/删除对历史餐点的影响。
11. 管理员、Google、条码、营养标示、品牌搜索的实际权限与上线范围。
12. 历史/食物/状态的数据量和是否需要游标/虚拟化。

## 14. 验收标准

### 核心用户任务

- [ ] 用户可完成登录→今日→新增（照片/描述/手动）→AI/手动确认→编辑→确认并储存。
- [ ] 至少 90% 测试用户能正确理解 AI 分析完成不代表餐点已储存。
- [ ] 保存失败 100% 保留原始输入、AI 草稿和用户修改；重试不产生重复餐点。
- [ ] 重新分析不会无声覆盖用户修改；冲突不会自动覆盖。
- [ ] Health Connect/健康权限不可用时，基础饮食记录仍可完成。

### IA/响应式

- [ ] 桌面侧栏可进入今日、历史/趋势、健康、我的食物、状态中心、设置；新增入口独立可见。
- [ ] `/dashboard*` 与 `date/view` 继续可用；新工作流有可恢复 URL 和清楚退出路径。
- [ ] 360/768/1024/1280/1440px 无关键横溢；平板侧栏/辅助抽屉可降级；移动 Web 单栏可完成 Review/储存。
- [ ] 表格桌面可排序/筛选/批量；移动保留优先字段和详情入口。

### 交互/无障碍

- [ ] P0 可完全键盘完成；`Ctrl/Cmd+K`、`N`、`Esc`、`Ctrl/Cmd+S` 在正确条件生效。
- [ ] Drawer/Dialog/Popover 焦点进入、循环、Esc、回焦正确；dirty 不静默丢失。
- [ ] 语义 table、字段错误关联、aria-live、图表文字/表格替代、焦点可见。
- [ ] Light/Dark、WCAG AA、放大、高对比、reduced motion、触控 48px 通过。

### 状态/内容

- [ ] empty/filter-empty/error/permission/expired/sync-failed/conflict 分开。
- [ ] loading 使用具体工作文案；关键错误不只 Toast；局部失败不打垮全页。
- [ ] 台湾繁体中文和统一「储存」词汇；AI、健康、过敏、隐私边界不夸大。

## 15. References and Skills

### 仓库与共享基础

- `docs/ui-design-system-shared.md`
- `README.md`
- `src/app/dashboard/layout.tsx`
- `src/components/dashboard-nav.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/health/page.tsx`
- `src/app/dashboard/foods/page.tsx`
- `src/app/dashboard/settings/page.tsx`
- `src/components/meal-capture-form.tsx`
- `src/components/meal-list.tsx`
- `src/components/saved-foods-manager.tsx`
- `src/app/globals.css`

### 工作流与外部资料

- `docs/ui-workflow/00-need-summary.md` 至 `07-content-report.md`
- Mobbin：完整 flows、Sidebar、Dialog、Toast、Progress。
- 60fps.design：Filter、AI、Calendar、Empty、Graph、Goal、Loading、Delete 状态分类。
- 表格、表单、W3C G98、空/错/载入与可访问性研究。
- Awwwards、Godly、Supahero：仅视觉方向和反例，不作为工作台布局规范。
- TinyFish/MCP 当前不可用；使用等效 Web 搜索与 readable fetch；React Bits Magic Bento/Pinterest 动态抓取失败。
- 已读取 `@sentiolabs/pi-frontend-design`，用于避免模板化 AI 美学。
- `design-dna`、`web-perf` 可用但本轮未执行完整提取/浏览器性能分析；外部 web accessibility、ux-audit、copywriting skill 不可用，以本工作流内建 checklist 兜底。

## 16. Prototype Recommendation

本轮不生成 HTML 原型，符合“先产出 Web-specific UI/UX specification、暂不修改生产代码”的要求。下一步如要继续，应先从以下选项中确认：

1. 关键页面原型：优先做桌面今日工作台或 AI 草稿审核页。
2. 完整原型：覆盖登录→记录→Review→储存的主要 Web 流程。
3. 仅保留规范：先依据本规范冻结产品决策，再进入实现。

原型生成前应重新确认：深色主题上线范围、草稿持久化、离线/冲突能力、正式品牌资产和字体授权。
