# 03-form-report.md

> 范围：仅设计 AI Food Diary 的 Web application。本报告不设计 Android／Flutter／原生 Mobile App，不修改生产代码。

## 1. Interface Type

- 桌面优先、响应式健康生活数据管理工作台。
- 核心形态：AI 辅助饮食记录、草稿审核、健康趋势与个人食物资料管理。
- 桌面：完整侧栏、主工作区、可选辅助面板。
- 平板：折叠侧栏、单主栏、辅助内容改抽屉。
- 移动 Web：顶部工具列、导航抽屉、单栏内容；不设计原生 App 底部导航或原生权限流程。
- 核心原则：AI 完成分析不等于已储存；草稿/已储存/待同步/已同步分开；摘要先行、详情渐进展开；表格比较与批量，卡片摘要，抽屉单笔详情；长任务不使用小 Dialog。

## 2. Page Inventory

| 页面／流程 | 目的 | 页面类型与布局 | 关键组件 | 优先级 | 当前路由 | 形态建议 |
|---|---|---|---|---|---|---|
| 登录／注册 | 进入账号 | 聚焦单栏表单 | Auth Form、Google、错误摘要 | P0 | `/login`、`/register` | 保留路由，脱离工作台 Shell |
| Web 工作台 Shell | 全域导航、主题、状态 | 三段式 Shell | Sidebar、Topbar、Status、User Menu | P0 | `/dashboard/*` | 扩展 `dashboard/layout.tsx` |
| 今日饮食 | 今日餐点与快速记录 | Dashboard，主栏 + 辅助栏 | 日期/KPI/时间线/饮水/状态 | P0 | `/dashboard` | 保留入口并重组 |
| 历史／周视图 | 比较日期、周平均 | Dashboard + 趋势表格 | 日期筛选、趋势图、日摘要表、抽屉 | P1 | `/dashboard?view=week` | 保留参数，未来可增 history |
| 新增餐点 | 照片、描述、手动草稿 | 路由化表单工作区 | Capture、上传、模式、草稿状态 | P0 | 当前嵌入 `/dashboard` | 建议 `/dashboard/meals/new` |
| AI 草稿审核 | 检查/修正/重分析 | 双栏审核工作区 | 来源预览、编辑器、AI 说明、操作栏 | P0 | 当前 Form 内部确认 | 建议 `/dashboard/reviews/[draftId]` |
| 餐点详情 | 查看/编辑/删除/再记录 | 列表 + 抽屉；移动独立页 | 摘要、项目、图片、编辑器 | P0 | `MealList` 内嵌 | 抽离详情行为，未来 `/dashboard/meals/[id]` |
| 健康概览 | 同步结果、来源、趋势 | 指标网格 + 历史抽屉 | 同步、指标、来源、更新时间、图表 | P1 | `/dashboard/health` | 保留路由重组 |
| 饮水 | 快速新增/查看 | 今日辅助模块 | 摘要、快速新增、记录 | P1 | `WaterCard` | 先留今日辅助栏 |
| 我的食物 | 管理食物、条码、重复 | 语义表格 + 详情抽屉 | 搜索、筛选、排序、批量、冲突 | P1 | `/dashboard/foods` | 保留路由升级管理视图 |
| 状态中心 | 处理保存、离线、同步、冲突 | 状态列表/表格 | 筛选、对象、日期、更新时间、CTA | P1 | 当前无专属路由 | 建议 `/dashboard/status` |
| 每日反馈 | AI 总结与建议 | 辅助面板/非阻塞抽屉 | Summary、生成状态、召回 | P1 | `DailySummaryPopup`、`AiInfoCard` | 移除强制阻塞式弹出 |
| 设置 | 个人、AI、连接、管理 | 设置侧栏 + 内容表单 | Settings Nav、表单、危险区 | P1/P2 | `/dashboard/settings` | 按分组重组 |
| Web 版本与管理 | 低频管理 | 设置内分组 | Version、Admin、登出 | P2 | `/dashboard/settings` | 与一般设置隔离 |

## 3. Layout Paradigm

### Desktop-first Shell

```text
┌─────────────────────────────────────────────────────────────────────┐
│                          Workspace Topbar                           │
├───────────────┬───────────────────────────────────┬─────────────────┤
│ Primary       │           Main Workspace          │  Auxiliary Panel │
│ Sidebar       │  页面摘要 / 主要操作 / 表格/图表   │ 饮水 / 同步 / AI │
│ 今日饮食      │                                   │                  │
│ 历史趋势      │                                   │                  │
│ 健康概览      │                                   │                  │
│ 我的食物      │                                   │                  │
│ 状态中心      │                                   │                  │
│ 设置          │                                   │                  │
└───────────────┴───────────────────────────────────┴─────────────────┘
```

- Web gutter 32px；工作台容器不可继续固定 `max-w-3xl`。
- Shell 内侧栏固定，主内容为主要滚动区；避免多个独立滚动容器。
- 主区 `minmax(0, 1fr)` 防止长名称/表格横溢；表格只在必要时局部横向滚动，核心字段不可隐藏。
- 卡片摘要、表格比较/批量、图表趋势、表单任务、抽屉单笔、Dialog 高影响确认、全屏工作区长流程。

### 主栏/辅助栏

| 场景 | 主工作区 | 辅助区 |
|---|---|---|
| 今日饮食 | 摘要、时间线、新增 | 饮水、同步、AI 反馈 |
| 新增餐点 | 输入与预览 | 上传限制、AI 状态、恢复 |
| AI 审核 | 食物项目编辑 | 原始输入、AI 说明、保存状态 |
| 历史趋势 | 图表与每日表格 | 选定日期摘要、定义 |
| 健康概览 | 指标与趋势 | 来源、更新时间、错误 |
| 我的食物 | 表格与批量 | 单笔编辑抽屉 |
| 设置 | 当前表单 | 设置分组导航 |

## 4. Navigation Model

### 桌面

- 一级侧栏：今日饮食、历史与趋势、健康概览、我的食物、状态中心、设置。
- 独立「新增餐点」主 CTA，不混入资料型导航。
- 顶部辅助区：面包屑/标题、日期上下文、全域搜索、同步状态、主题、用户菜单。
- 当前四项「飲食 / 健康 / 食物 / 設定」命名保留；胶囊顶栏作为过渡形态重组为侧栏。

### Active/Breadcrumb/URL

- 当前一级目的地始终 active；详情示例 `今日饮食 / 午餐 / 餐点详情`。
- 面包屑不替代返回按钮。
- URL 反映日期、日/周、筛选、选定餐点/食物、草稿/审核阶段。

### 平板与移动 Web

- 平板侧栏折叠为窄栏或按钮抽屉，辅助面板改右侧 Drawer。
- 移动 Web 使用顶部工具列 + 导航抽屉，长表单完整页面滚动；详情抽屉转全屏覆盖层/独立路由；不强制横向滚动核心操作。
- 全域快捷键：`Ctrl/Cmd+K` 搜寻、`N` 新增（非输入区）、`Esc` 关闭/未保存提示。

## 5. Component Strategy

### Shell

| 组件 | 责任 | 当前来源 |
|---|---|---|
| `AppShell` | 认证后容器、主题、全域状态 | `dashboard/layout.tsx` |
| `PrimarySidebar` | 一级导航与新增 CTA | `dashboard-nav.tsx` |
| `WorkspaceTopbar` | 标题、面包屑、搜索、用户 | 未来建议 |
| `GlobalSearch` | Ctrl/Cmd+K 搜索 | 未来建议 |
| `SyncStatusIndicator` | 离线/待同步/冲突/失败 | 未来建议 |
| `StatusCenterDrawer` | 快速状态摘要 | 未来建议 |

### Dashboard/Timeline

- `SummaryBand`、`MetricSummary`、`GoalComparison`、`MealTimeline`、`DailyFeedbackPanel`、`WaterQuickEntry`、`TrendSummary`。
- 餐点默认按时间分组，摘要显示名称、时间、热量、来源、状态；食物细项/AI 说明通过展开或抽屉查看。

### Table/Filters

- 语义 `table/thead/tbody/th scope`，不默认 ARIA grid。
- 支持表头含义、键盘、行操作、选择、排序与筛选说明。
- 密度 compact/regular/comfortable；桌面 sticky header，必要时固定首列；移动保留优先字段。
- 统一工具列：`搜索`、筛选 chips、排序、显示栏位、结果数量、清除全部；URL 保存可分享筛选。

### Drawer/Dialog

- Drawer：餐点、食物、健康指标、状态、饮水历史；打开焦点进入，Esc 关闭，关闭回触发元素，dirty 先确认；移动转全页/全屏。
- Dialog：删除、另存、冲突、离开未保存、高影响设置；不承载新增餐点、AI 审核、长表格或多步骤编辑。

### Capture/Review

```text
CaptureWorkspace
├── CaptureModeTabs
├── SourceInput
├── UploadPreview
├── OptionalPrecisionSettings
└── DraftStateBar
        ↓ 分析完成
ReviewWorkspace
├── SourceSummary
├── EditableFoodItems
├── AIExplanation
├── ValidationSummary
└── StickyActionBar
        ↓ 确认
SaveState: saving → saved / pending-sync / error / conflict
```

- 表单字段有 label、单位、必填、范围、错误关联；错误摘要在顶部并链接首错。
- AI 草稿、用户修改、保存状态明显区分；重分析说明覆盖范围；失败不关闭/清空。

### State Components

统一状态：idle、input、captured、uploading、analyzing、review、review-unsaved、saving、saved、offline、pending-sync、error、permission-required、permission-denied、syncing、sync-failed、empty、conflict。状态必须绑定对象/任务；重要错误不只 Toast；局部失败不打垮 Shell。

## 6. Responsive Strategy

| 宽度 | 侧栏 | 主/辅助 | 表格 | AI 审核 | Dialog/Drawer | 固定操作栏 |
|---|---|---|---|---|---|---|
| 360px | 隐藏，顶部按钮开导航抽屉 | 单栏，辅助下移 | 仅优先字段，详情全屏 | 单栏堆叠 | 短 Dialog 置中，长内容全屏 | 底部固定并给滚动底距 |
| 768px | 折叠或抽屉 | 单主栏，辅助右抽屉 | 少量字段，不缩小文字 | 上下分区 | 中宽抽屉 | 横向或换行 |
| 1024px | 窄栏/可展开 | 主栏优先，辅助收起 | 优先列+次要横滚 | 主编辑+窄辅助或堆叠 | 详情抽屉；长编辑独立页 | 保存/取消可见 |
| 1280px | 持久侧栏 | 主栏+辅助栏 | 语义表格、sticky、批量栏 | 双栏审核 | 详情抽屉 | 工作区底部或固定 |
| 1440px | 完整侧栏 | 主栏扩展+辅助 | 比较字段、批量、详情 | 来源/编辑/辅助同时呈现 | 抽屉只做详情 | 与内容对齐 |

共同规则：360/768/1024/1280/1440 都检查无非预期横溢；触控目标至少 48px；窄屏不缩小字体；图表转文字摘要/简图/可展开表；固定侧栏不遮挡缩放内容；抽屉有关闭、焦点回收和键盘操作。

## 7. Density and Scanning Model

| 模式 | 使用场景 | 内容表现 | 触控边界 |
|---|---|---|---|
| Compact | 进阶用户、食物批量、历史比较 | 少垂直间距、多表格行、次要字段同行 | 行可紧凑，但按钮/复选框/链接仍至少 48px 目标 |
| Regular | 默认、今日、健康 | 摘要与详情平衡 | 主要操作至少 48px |
| Comfortable | 大众、首次、复杂表单、移动 Web | 单列、少同屏字段、说明完整 | 目标至少 48px |

同一数据模型渐进展开：首屏显示名称/时间/热量/主要营养/AI或同步状态；展开显示项目、份量、估算、来源、更新时间、编辑记录。进阶用户用 compact/快捷键/筛选/批量，普通用户用 regular/单一主 CTA/摘要优先。

扫描顺序：页面上下文 → 当前状态 → 主要摘要 → 唯一主动作 → 对象列表/表格 → 辅助说明 → 次要/危险操作。管理员、AI 设置、删除不在首屏主区。

## 8. 页面 Wireframe 摘要

### 今日饮食

```text
[侧栏] [今日饮食/日期] [搜索] [同步] [用户]
今日饮食 [日][周] [上一日][日期][下一日] [新增餐点]
┌ 今日摘要：热量/目标/macro ┐ ┌ 今日状态：同步/饮水/AI 反馈 ┐
餐点时间线：早餐/午餐/晚餐摘要行与状态/查看
周回顾或每日文字摘要
```

### 新增餐点

```text
[返回今日] 新增餐点 [草稿状态]
┌ 记录方式/餐期/输入区 ┐ ┌ 当前草稿/限制/AI 状态/离开保留 ┐
[固定操作：取消][保存草稿][开始分析]
```

### AI 审核

```text
[返回] AI 草稿审核 [AI 已完成/尚未储存]
┌ 原始输入+食物项目编辑 ┐ ┌ AI 说明/来源/重分析/缺失 ┐
[保留草稿][重新分析][确认储存]
```

### 我的食物

```text
我的食物 [新增]
[搜索][筛选 chips][排序][清除] 共 N 笔
[已选 N][批次封存]
|□|名称|份量|营养摘要|来源|使用次数|操作|
点击行→详情抽屉；批量只作用于已选。
```

### 健康/状态/设置

- 健康：同步来源/时间 → 指标摘要网格 → 趋势 + 文字表格替代 → 指标历史抽屉。
- 状态：状态分组/筛选 → 结果数量 → 对象/日期/状态/更新时间/CTA → 详情抽屉。
- 设置：设置侧栏（个人、AI、Google、隐私、版本、管理员、登出）+ 当前内容表单/保存状态。

## 9. 页面内排序/筛选/批量/分页/展开

- 今日：餐点新到旧，按餐期分组；不为缺失餐期制造资料；详情默认收合；日/周/日期/筛选写 URL。
- 历史：图表与表格共享筛选；周平均与每日值分开；缺失日期显示无记录，不补零；表格排序不改变图表时序。
- 我的食物：默认收藏→最近使用→使用次数→更新时间；搜索名称/品牌/条码；筛选显示计数；批量只作用当前筛选已选；未来分页/游标，迁移期可保留载入更多；详情抽屉；冲突明确使用/更新/还原/另存。
- 健康：按指标分组，时间范围筛选，图表与表格选中同步，局部失败独立处理，显示来源/更新时间/过期。
- 状态：冲突→保存失败→同步失败→待同步→离线保留；每行有 CTA；单项/批次重试记录失败范围；完成后移出待处理并反馈。
- 全域搜索：餐点/食物/日期/状态分组；Ctrl/Cmd+K 开 Dialog，结果详情用路由/抽屉；无结果与不存在分开。

## 10. 当前重组与未来路由

| 当前 | 重组 | 性质 |
|---|---|---|
| `dashboard/layout.tsx` | AppShell/Sidebar/Topbar/状态层 | 现有重组 |
| `dashboard-nav.tsx` | PrimarySidebar | 现有重组 |
| `dashboard/page.tsx` | 上下文/摘要/时间线/辅助栏 | 现有重组 |
| `meal-capture-form.tsx` | Capture/Review Workspace | 中等迁移 |
| `meal-list.tsx` | 数据列表 + 详情编辑/删除 | 现有重组 |
| `date-range-switcher.tsx` | DateContextBar | 现有重组 |
| `water-card.tsx` | 饮水摘要/快速新增 | 现有重组 |
| `weekly-nutrition-review.tsx` | 历史趋势摘要 | 现有重组 |
| `health-history.tsx` | 指标详情抽屉 | 现有重组 |
| `saved-foods-manager.tsx` | Foods Table/Filter/Drawer/Conflict | 中等迁移 |
| settings page | 设置分组/URL 子状态 | 现有重组 |
| `DailySummaryPopup` | 非阻塞反馈面板/状态入口 | 现有重组 |

未来建议 `/dashboard/meals/new`、`/dashboard/reviews/[draftId]`、`/dashboard/meals/[id]`、`/dashboard/history`、`/dashboard/status`、`/dashboard/settings/profile|ai|privacy`。兼容现有 `/dashboard*` 与 `?date=&view=`，新路由可先 canonical，旧入口保留转址/兼容。

## 11. 组件库策略与 Trade-offs

推荐现有 Tailwind + 自研语义组件层；Dialog/Drawer/Popover/Tabs/Focus Trap 用无头可组合实现；不引入大型全套 UI 框架。原因是现有业务组件多，需要定制表格、审核器和状态；无头方案便于键盘/焦点/屏幕阅读器/reduced motion。

- 侧栏替代顶部 Tab：可容纳历史、状态中心、设置子分组并保持上下文；代价是桌面壳层迁移。
- 新增/审核用路由工作区而非 Dialog：可恢复、浏览器返回明确、适合长任务；代价是草稿生命周期和 URL 状态。
- 餐点详情用抽屉：保持日期上下文；移动转完整页。
- 食物表格而非卡片：支持比较/排序/筛选/批量；移动需优先列/详情策略。
- 高密度与摘要共存：默认摘要、渐进展开、密度模式、隐藏次要字段；不拆两套产品模式。

## 12. 迁移成本与验证

| 项目 | 成本 | 风险 | 建议 |
|---|---:|---|---|
| 顶部导航→侧栏 | 中 | 宽度/active 变化 | 先保留 URL，替换 Shell |
| `max-w-3xl`→工作台容器 | 中 | 卡片/间距需校准 | 先建立主/辅容器 |
| 餐点列表→时间线 | 中 | 编辑绑定卡片 | 先保留 API，抽离详情 |
| Form 拆分 | 高 | 输入/AI/保存状态集中 | 先定义草稿状态再拆 UI |
| Review 路由化 | 高 | 草稿 ID/刷新/离开提示 | 作为 P0 单独验证 |
| 食物→语义表格 | 中 | 当前客户端载入更多 | 先保留 API，再换呈现 |
| 状态中心 | 高 | 需统一跨页面状态 | 先建立状态对象/错误来源 |
| 设置分组 | 低至中 | 当前纵向长页 | 先做设置侧栏 |
| 明暗主题 | 中 | 当前 color-scheme light/glass | 视觉阶段统一 token |

验证：360/768/1024/1280/1440 无横溢；5秒找到导航和新增 CTA；区分 AI 完成/草稿未存/已存/待同步/已同步；模拟失败/离线/冲突不丢；键盘完成 P0；Dialog/Drawer 焦点进/循环/Esc/回焦；图表有文字替代；reduced motion 信息完整。

## 13. 外部来源说明

TinyFish/MCP 不可用，使用等效搜索/readable fetch；React Bits/Pinterest 动态失败；Mobbin 用于完整 flow/Sidebar/Dialog/Toast/Progress；Awwwards/Supahero/Godly 仅视觉灵感；已读取 `@sentiolabs/pi-frontend-design` 以避免 AI-slop；design-dna/web-perf 可用但未执行；外部 Web accessibility/UX audit 不可用，使用内建 checklist。没有使用 Android/Flutter layout 作为参考。
