# 05-ia-report.md

> 范围：仅 AI Food Diary Web application，桌面优先、响应式，覆盖平板 Web 与移动 Web；不设计 Android/Flutter/原生 Mobile App，不修改生产代码。标记：**[事实]** 仓库/上游报告事实；**[设计推断]** IA 建议；**[待确认]** 影响路由、权限、资料生命周期或范围的未决项。

## 1. Navigation Model

### 1.1 主导航

采用「持久左侧栏 + 主工作区 + 可选辅助面板」。保留四个领域心智模型，导航层级最多两级持久导航，第三级由面包屑、URL 和对象详情承载：

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

- **[事实]** 当前导航已有「飲食／健康／食物／設定」四项。
- **[设计推断]** 历史/趋势归入饮食第二级；状态中心是跨领域工作入口，应独立于设置。
- 「新增餐点」是侧栏中独立的主要 CTA，不是资料型导航项。
- 状态中心固定入口，可显示待处理数量，但不能只靠数字或颜色表达。
- 详情对象不加入侧栏，避免导航随数据增长。

### 1.2 Topbar

Topbar 只负责上下文与全局工具：

```text
[面包屑 / 页面标题] [日期上下文]       [全局搜索] [同步状态] [主题] [用户菜单]
```

日期仅在今日/历史/餐点详情等需要处出现；全局搜索桌面显示并支持 `Ctrl/Cmd+K`，移动 Web 由工具列按钮打开搜索层；同步状态点击进入状态中心；用户菜单含个人资料/设置/登出，不重复完整设置导航。

### 1.3 Active、Breadcrumb、Status Center

| 页面 | Active |
|---|---|
| `/dashboard` | 飲食 → 今日饮食 |
| `/dashboard?view=week` 或 `/dashboard/history` | 飲食 → 历史与趋势 |
| `/dashboard/meals/new`、`/dashboard/reviews/[draftId]`、`/dashboard/meals/[mealId]` | 飲食 |
| `/dashboard/health` | 健康 → 健康概览 |
| `/dashboard/foods` | 食物 → 我的食物 |
| `/dashboard/status` | 状态中心 |
| `/dashboard/settings/*` | 設定 |

面包屑示例：`飲食 / 今日饮食`、`飲食 / 历史与趋势 / 选定日期`、`飲食 / 待确认 / AI 草稿`、`食物 / 我的食物 / 食物详情`、`設定 / AI 设置`。面包屑不取代返回按钮；移动 Web 压缩为返回 + 当前标题。状态中心收纳待确认、保存失败、离线保留/待同步、同步失败、冲突、权限/连接问题和最近完成任务；它是状态统一索引，不是另一份业务资料来源。

### 1.4 平板与移动 Web

- 平板：侧栏折叠为 rail 或抽屉；主工作区单栏优先；辅助面板转 Drawer；AI review 从双栏变上下。
- 移动 Web：顶部工具列 + 导航抽屉 + 单栏；不模拟原生 App 底部 Tab；详情抽屉转全屏详情或独立路由；表格保留名称、日期/时间、核心数值、状态、主要动作；其他详情进入对象页；`Esc`/浏览器返回/可见返回按钮都能退出层级。

## 2. Route / Page Hierarchy

### 2.1 当前路由与建议 canonical

| 当前路由 | 建议 canonical | 迁移/兼容 |
|---|---|---|
| `/login`、`/register` | 原路由 | 保留 |
| `/dashboard` | `/dashboard` | 继续作为今日饮食入口 |
| `/dashboard?date=&view=day` | 原查询 | 保留日期上下文 |
| `/dashboard?date=&view=week` | `/dashboard/history?...` | 兼容入口，逐步导向历史/趋势 |
| `/dashboard/health` | 原路由 | 健康概览 canonical |
| `/dashboard/foods` | 原路由 | 我的食物 canonical |
| `/dashboard/settings` | 原路由 | 设置入口 |
| 当前嵌入表单 | `/dashboard/meals/new` | 新增餐点工作区，逐步引入 |
| 当前内部 review | `/dashboard/reviews/[draftId]` | 需先确认草稿可持久化 |
| 当前内嵌详情 | `/dashboard/meals/[mealId]` | 桌面可用详情 Drawer 表现 |
| 无独立状态页 | `/dashboard/status` | P1 |
| 无独立搜索页 | `/dashboard/search` | 全局搜索结果 |
| 纵向设置页 | `/dashboard/settings/profile|ai|integrations|privacy|about` | 分阶段扩展，不强制一次拆完 |

### 2.2 建议 sitemap

```text
/login
/register
/dashboard
├── /dashboard?date=YYYY-MM-DD&view=day|week
├── /dashboard/meals/new
├── /dashboard/reviews/[draftId]
├── /dashboard/meals/[mealId]
├── /dashboard/history
│   ├── 日期/范围
│   ├── 趋势摘要
│   ├── 历史餐点表格
│   └── 餐点详情抽屉
├── /dashboard/health
│   └── 指标详情抽屉
├── /dashboard/foods
│   ├── 搜索/筛选
│   ├── 食物表格
│   ├── 详情抽屉
│   └── 批量封存/还原/冲突
├── /dashboard/status
│   ├── 需要我处理
│   ├── 处理中
│   ├── 稍后重试
│   └── 已完成
├── /dashboard/settings
│   ├── /profile
│   ├── /ai
│   ├── /integrations
│   ├── /privacy
│   ├── /about
│   └── 管理员（有权限）
└── /dashboard/search
```

迁移原则：不删除现有 `/dashboard*`；`/dashboard` 保持今日 canonical；保留 `date`/`view`；新入口逐步导向 canonical 并保留日期、筛选、来源上下文；详情 URL 用对象 ID，桌面用 Drawer，移动用完整页；不为每种错误建新路由。

## 3. Information Groups

| 群组 | 用户问题 | 核心对象 | 入口 |
|---|---|---|---|
| 飲食 | 今天/过去吃了什么？下一餐怎么记录？ | Day、Meal、FoodItem、AIDraft | 今日、历史、新增 |
| 健康 | 资料目前什么状态？趋势如何？ | HealthSummary、HealthMetric | 健康概览 |
| 食物 | 哪些资料可以重复使用？ | FoodAsset、SavedFood | 我的食物、记录选择器 |
| 設定 | 如何管理个人、AI、连接、资料？ | Profile、Preference、Integration | 设置 |
| 状态中心 | 哪些需要我处理？ | SyncTask、Draft、Conflict | 状态中心、Topbar |

对象模型：

```text
User
├── Day（用户时区日期聚合）
│   ├── Meal
│   │   ├── FoodItem（记录当时的份量/营养快照）
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

- `Meal` 用户确认保存后才是正式账号资料。
- `FoodAsset` 可收藏/编辑/封存/还原，但不可未经确认直接成为餐点。
- `AIDraft` 可编辑/重分析/失败恢复，不等于正式餐点。
- `HealthSummary` 必须带来源/更新时间/状态，不承载诊断。
- `SyncTask` 绑定对象、状态、更新时间和 CTA；状态中心聚合对象状态，不拥有另一份业务数据。
- **[待确认]** AIDraft 是否有稳定 ID，决定 review 是否可独立 URL 恢复。

统一状态：`idle/input/captured/uploading/analyzing/review/review-unsaved/saving/saved/offline/pending-sync/error/permission-required/permission-denied/syncing/sync-failed/empty/conflict`。

统一标签：`AI 估算`、`待确认`、`已由你修改`、`已储存`、`保存失败`、`离线保留`、`待同步`、`同步失败`、`资料过期`、`无资料`、`尚未授权`、`发生冲突`。不要混用 AI 完成/储存完成、本机/账号/同步、筛选无结果/全局无资料、未授权/无资料、过期/失败、用户修改/错误。

## 4. Search / Filter / Sort Model

### 4.1 搜索入口与范围

- 桌面 Topbar 全域搜索，`Ctrl/Cmd+K`；移动 Web 工具列按钮打开搜索层。
- 页面内：历史搜索餐点/食物；我的食物搜索名称/品牌/条码；状态中心按对象/任务/状态；健康主要用指标/日期筛选，不做全文搜索。
- 结果多时进入 `/dashboard/search`，Dialog 只做快速输入。
- 默认搜索对象：已储存餐点/食物、日期、可恢复草稿/状态和用户有权限的设置/帮助；不默认全文暴露原始健康数值、原图、管理员资料或临时输入。
- **[待确认]** 是否允许搜索健康指标名称/历史值；URL 中关键词是否造成隐私风险。

### 4.2 URL 状态

```text
/dashboard?date=YYYY-MM-DD&view=day|week
/dashboard/history?from=&to=&q=&status=&sort=date&dir=desc&cursor=
/dashboard/foods?q=&source=&favorite=&archived=&sort=recent|favorite|usage|updated&dir=&cursor=
/dashboard/status?state=needs-action|processing|retry|completed&type=draft|save|sync|permission|conflict&sort=priority|updated&cursor=
/dashboard/health?metric=&range=7d|30d|90d|custom&from=&to=&source=
/dashboard/search?q=&scope=all|meals|foods|status|health&cursor=
```

URL 必须恢复结果条件、日期、排序、选中对象；不含原始图片、完整错误内容或敏感凭证。

### 4.3 通用过滤规则

- 不同类别 AND，同一类别多个值 OR。
- 已启用条件显示可移除 chips；显示结果数量；提供 `清除全部`；清除后回默认查询。
- 筛选无结果时保留条件，不自动重置；空资料、筛选无结果、系统错误分开。

### 4.4 历史/趋势

筛选：日期范围、日/周、关键词、资料状态、待处理。默认日期新到旧，同日按 `eatenAt` 新到旧，时间相同用稳定 ID；图表始终旧到新。表格排序不改变图表时间序列。餐期/营养范围只有在数据字段稳定后再加入。

### 4.5 我的食物

保留当前默认语义：收藏优先 → 最近使用 → 使用次数 → 更新时间。可切换名称、来源、条码、有无冲突、已封存。工具列显示搜索、chips、排序、数量、清除和选取数量；批量只作用当前筛选中明确选取对象。

### 4.6 状态中心

筛选：需要我处理、处理中、稍后重试、已完成；对象：AI 草稿、餐点保存、同步任务、权限/连接、冲突。排序：冲突/保存失败 → 需要处理草稿 → 同步失败 → 待同步 → 处理中 → 最近完成。每项显示对象、类型、日期、更新时间、状态、资料是否保留、CTA。

### 4.7 健康

结构化筛选：指标类别、时间范围、资料来源、资料状态（无资料/过期/失败）。图表、文字摘要、资料表同步；缺失指标说明原因，不补零。

### 4.8 分页/游标/无结果

历史、我的食物、状态中心优先游标分页或载入更多，保留筛选/排序；游标失效时提示重新载入，不静默改变条件。健康长范围按日/周/月聚合并说明期间。数据量级未确认前不引入复杂虚拟列表。

无结果处理：
1. 首次无资料：说明尚无资料，提供创建入口。
2. 筛选无结果：显示当前条件、0 结果、移除单项/清除全部。
3. 系统错误：说明读取失败和重试，不伪装为空。
4. 搜索无结果可检查关键词、清除筛选、改用描述、手动新增；不自动创建对象。

## 5. Cross-page User Flows

### 首次记录

`/login|register → /dashboard 空状态 → /dashboard/meals/new → 照片/描述/手动 → 分析/确认 → /dashboard/reviews/[draftId] → 修正 → 确认并储存 → /dashboard/meals/[mealId] 或返回 dashboard`。

有输入离开需确认；若没有持久 draft ID，MVP 可在同一工作区完成但必须保留明确草稿状态。

### AI Review

今日或状态中心 → AI 草稿 → 查看来源 → 检查食物/份量/营养 → 修改 → 确认储存。重新分析先说明覆盖；失败保留原始输入和修改；review 不等于 saved。

### 失败/离线/冲突

Review → saving → error/offline/pending-sync/conflict → 状态中心 → 重试/查看差异/回草稿。不能丢输入、伪装已同步或静默覆盖；是否支持完整离线创建待确认。重试需避免重复餐点。

### 历史回顾

今日 → 历史/趋势 → 日期/范围 → 摘要/图表/表格 → 餐点详情 Drawer → 编辑/再次记录/返回。关闭详情恢复原日期、筛选、排序、滚动上下文。

### 我的食物

新增餐点 → 食物选择器 → 搜索/最近/收藏 → 选择份量 → 回餐点草稿；或我的食物 → 搜索/筛选 → 详情抽屉 → 编辑/收藏/封存/还原/冲突 → 回列表。保留列表查询状态；封存不应删除历史餐点（正式规则待确认）。

### 健康

健康概览 → 来源/更新时间 → 指标 → 时间范围 → 趋势/详情 → 回健康。Web 只显示同步结果，不承载原生授权；健康无资料或拒绝不阻塞饮食。

## 6. Page Hierarchy / Entry / Exit

- 登录/注册为独立聚焦页，无工作台侧栏；成功进入 `/dashboard`。
- 今日首层：日期/日周、记录饮食、摘要、待处理；餐点时间线和饮水次层；反馈/净热量/来源详情第三层。
- 新增餐点首层是记录方式/餐期/开始；高级选项渐进展开；长流程不用 Dialog。
- AI review 首层是 `AI 估算・待确认`、编辑字段、确认储存；来源/依据/编辑历史第三层。
- 餐点详情桌面 Drawer 保持来源上下文，直接 URL/移动用完整页；未保存状态为 review-unsaved。
- 历史图表和表格共享筛选；图表不是唯一表达；详情关闭回原上下文。
- 健康第一层是来源/更新时间/同步状态，第二层指标/趋势，第三层计算说明与恢复。
- 食物第一层是搜索/筛选/批量，第二层表格，第三层详情/冲突。
- 状态中心第一层是需要处理/处理中/重试与数量，第二层对象/状态/CTA，第三层错误/冲突细节。
- 设置使用设置内分组；管理员/隐私/删除与一般偏好分离且有权限/确认。

## 7. Scalability Notes

- 新页面先归属现有领域，只有独立核心任务/高频/独立筛选或权限时才增加一级导航。
- 条码、营养标示、品牌搜寻先作为新增餐点或我的食物子流程，不新增一级导航。
- 历史、食物、状态从一开始保留筛选/排序/游标；今日只显示选定日/周；详情按对象载入完整资料，避免列表携带所有图片。
- 一般用户只能看到自己的对象；管理员内容限权；搜索不得跨权限边界；健康/照片/体重/AI 输入是敏感资料。
- 状态中心是行动清单，不变成技术日志系统；技术日志不默认进入一般用户路径。
- 路由规则建议 `/dashboard/<domain>`、`/<collection>`、`/<object>/<id>`、`/dashboard/<workflow>/<id>`；不建立无限静态层级。

### MVP 先保留

现有认证、`/dashboard` 今日、date/view、照片/描述/手动、AI review/确认、餐点维护、核心失败恢复、健康摘要/来源/更新时间、我的食物搜索/收藏/排序/封存/详情、基本设置、最小状态中心、Ctrl/Cmd+K/N/Esc。

可暂缓：独立历史 canonical（先用 date/view）、复杂健康分类、健康全文搜索、完整离线引擎、条码/品牌深度增强、复杂管理员、导出/删除高级流程、推荐/评分/社交。

## 8. Risks and Simplification Options

- **结构过深**：持久导航最多两级；对象详情用面包屑/URL/Drawer；状态中心不复制业务页。
- **死胡同**：空状态必须有记录入口；AI 失败可手动；筛选无结果可清除；保存失败可回草稿；状态项有 CTA；健康失败可回饮食。
- **认知负担**：今日首屏仅日期、摘要、待处理、新增；营养/来源/反馈渐进展开；不拆大众/进阶两套。
- **状态混淆**：每状态绑定对象/日期/更新时间/CTA，失败保留，冲突不覆盖。
- **路由迁移**：保留旧路径和查询；新 canonical 渐进接入；不维护两套独立页面逻辑。
- **待确认**：AI draft ID、完整离线、同步/冲突语义、数据量、多账号/管理员代操作、健康过期、健康指标子页、全局搜索健康、设置/隐私范围、日期/时区/单位、食物封存对历史影响。

### 简化选项

1. 若草稿未持久化：先维持新增/审核同一工作区，状态中心显示可恢复的浏览器草稿，不假装跨设备恢复。
2. 若数据量小：先使用当前载入/载入更多，但 URL 查询/稳定排序先冻结，未来替换游标。
3. 若离线能力未就绪：只显示明确的草稿保留/重试状态，不承诺自动同步。
4. 若历史路由未准备：继续使用 `/dashboard?date=&view=`，先用 IA/视觉提供清晰导航。
5. 若设置子路由尚未准备：使用设置页内目录/锚点，但保持未来子路由命名。

## 9. IA Acceptance Checklist

- [ ] 桌面侧栏可进入今日、历史/趋势、健康、我的食物、状态中心、设置；新增餐点独立可见。
- [ ] 现有 `/dashboard*` 路径、date/view 继续可用；新工作流有清晰进入/退出。
- [ ] 详情 URL 可刷新进入；桌面 Drawer 关闭回原列表/筛选/滚动；移动返回语义一致。
- [ ] 用户完成登录→今日→新增→AI/手动→修正→确认储存；AI 完成不被误解为已储存。
- [ ] 重分析不静默覆盖；失败/离线/冲突不丢、不假同步、不自动覆盖；状态项有对象/日期/更新时间/CTA。
- [ ] Ctrl/Cmd+K、N、Esc 可用；筛选 chips/count/clear；空/筛选空/错误分开；大列表稳定排序和分页/游标。
- [ ] 360/768/1024/1280/1440 响应式无关键溢出；移动表格优先列；AI review 可完成。
- [ ] 页面标题/面包屑/区域顺序清晰；Dialog/Drawer 焦点进/回焦；语义表格；图表文字替代；状态不只靠颜色。

## 10. Sources / Skill Limitations

- 仓库事实：`src/app/dashboard/layout.tsx`、`dashboard-nav.tsx`、dashboard/health/foods/settings 页面与相关组件。
- 上游报告：`01-research-report.md`、`02-need-report.md`、`03-form-report.md`、`04-visual-report.md`。
- 研究：Mobbin、60fps.design、数据表格/表单/状态资料；Awwwards、Supahero、Godly 仅视觉目录。
- TinyFish/MCP 不可用，使用等效 Web 搜索/readable fetch；React Bits/Pinterest 动态抓取失败；已读取 `@sentiolabs/pi-frontend-design`；design-dna/web-perf 可用但未执行；外部 Web accessibility/UX/copywriting skill 不可用，使用内建 checklist 兜底。
- 无真实用户访谈、可用性、屏幕阅读器、大数据量压力或性能基线；未使用任何 Android/Flutter IA 作为 Web 模板。
