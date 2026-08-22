# 04-visual-report.md

> **项目**：AI Food Diary
> **范围**：仅 Web application，桌面优先，覆盖平板与移动 Web。
> **用途**：作为下游 IA、交互、内容与总审核的视觉 token、风格及状态权威输入。
> **明确排除**：不设计 Android、Flutter、原生 Mobile App；不生成 HTML 原型；不修改生产代码。

## 1. Visual Concept

### 暖炭色的证据型饮食工作台（Warm Evidence Desk）

以暖米色作为长期使用的画布，以炭色建立可信的内容层级，以 amber、terracotta、olive 建立品牌与生活感，再以清楚的营养数据色表达分类。整体像一个安静、可信、可以持续回顾的个人工作台，而不是医疗仪表板或营销型 SaaS。

核心原则：暖但不松散、专业但不医疗化、AI 有帮助但不是裁判、信息密度高但先看摘要、工作台而非营销首页。颜色表达类别，不表达好坏。

### 视觉记忆点：餐点节奏线（Meal Rhythm Rail）

在今日饮食与历史页面中，用一条细的炭色或 olive 时间轴连接餐点节点；当前选中的餐点使用 amber 节点，AI 草稿使用 terracotta/amber 外圈。它只用于时间线/历史语境，不作为全站背景，不使用持续动画；节点必须同时显示名称、时间或文字标签，不能只靠颜色。移动 Web 简化为单栏时间线。

## 2. Aesthetic Direction

- **关键词**：温暖、精确、可信、克制、可恢复。
- **默认密度**：Regular；进阶表格可 Compact；复杂表单和移动 Web 使用 Comfortable。
- **层级**：页面标题/日期/核心摘要/主 CTA → 餐点列表、AI 草稿、趋势、表格、筛选 → 营养项目、来源、编辑历史、同步资讯、错误恢复 → 状态中心、建议、帮助。
- **桌面**：32px gutter、持久侧栏、主工作区、可选辅助面板；不使用大量卡片制造卡片墙。
- **平板**：单主栏、侧栏折叠/抽屉、辅助内容抽屉。
- **移动 Web**：顶部工具列、导航抽屉、单栏；不模拟原生底部导航。
- **明亮主题**：暖米画布 `#FDF6EC`、页面脚手架 `#FAF8F5`、内容面 `#FFFFFF`、浮层 `#FFFDF9`、主文字 `#292320`、amber `#B45309`、terracotta `#D96343`、olive `#596B32`。
- **深色主题**：画布 `#14110F`、内容面 `#211C19`、次级面 `#2C2622`、浮层 `#3D342E`、主文字 `#F5F0EA`、亮 amber `#FBBF24`；依靠表面明度/边框建立层级，不依赖强阴影。

## 3. Design Tokens

### 3.1 Color

#### Surface / Content / Border / Brand

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `surface.canvas` | `#FDF6EC` | `#14110F` | 全局画布 |
| `surface.scaffold` | `#FAF8F5` | `#14110F` | 页面脚手架 |
| `surface.default` | `#FFFFFF` | `#211C19` | 卡片、表单、表格 |
| `surface.subtle` | `#F4F1EC` | `#2C2622` | 筛选区、辅助说明、表头 |
| `surface.elevated` | `#FFFDF9` | `#3D342E` | Drawer、Popover、Dialog |
| `content.primary` | `#292320` | `#F5F0EA` | 标题、正文、关键数值 |
| `content.secondary` | `#57534E` | `#B8AFA5` | 描述、单位、次要说明 |
| `content.tertiary` | `#8A817A` | `#8A7F75` | 时间、弱化说明，不承载唯一重要信息 |
| `content.on-brand` | `#FFFFFF` | `#1A1614` | 品牌填充上的内容 |
| `border.subtle` | `#F4F1EC` | `#2C2622` | 弱分隔 |
| `border.default` | `#E9E3DA` | `#3A332E` | 默认边框 |
| `border.strong` | `#D6D0C7` | `#4A413A` | 选中、表格首列、重要区隔 |
| `brand.primary` | `#B45309` | `#FBBF24` | 主 CTA、主动导航 |
| `brand.hover` | `#92400E` | `#FCD34D` | Web hover |
| `brand.pressed` | `#78350F` | `#F59E0B` | pressed |
| `brand.soft` | `#FEF3C7` | `#2A2012` | AI 草稿、轻品牌提示 |
| `accent.terracotta` | `#D96343` | `#ED7E5D` | 食物/生活方式辅助强调 |
| `accent.olive` | `#596B32` | `#91A360` | 健康语境、稳定、比较线 |

#### Status

| Token | Light 主色/底色 | Dark 主色/底色 | 语义 |
|---|---|---|---|
| `status.success` | `#059669` / `#ECFDF5` | `#34D399` / `#0E2A1E` | 已储存、同步完成 |
| `status.warning` | `#D97706` / `#FFFBEB` | `#FBBF24` / `#2A2012` | 需要确认、资料不足、待处理 |
| `status.danger` | `#E11D48` / `#FFF1F2` | `#FB7185` / `#2E1416` | 真正错误、删除、不可恢复 |
| `status.info` | `#0284C7` / `#F0F9FF` | `#38BDF8` / `#0E2230` | 资讯、同步、权限说明 |

`status.success` 不表示营养好，`status.danger` 不表示饮食坏；状态颜色必须同时配文字、图标或结构。

#### Macro / Data Visualization

| Token | Light 主色/底色 | Dark 主色/底色 | 仅表示 |
|---|---|---|---|
| `macro.protein` | `#0EA5E9` / `#E0F2FE` | `#38BDF8` / `#102F43` | 蛋白质 |
| `macro.fat` | `#F59E0B` / `#FEF3C7` | `#FBBF24` / `#3A2B0D` | 脂肪 |
| `macro.carbs` | `#F43F5E` / `#FFE4E6` | `#FB7185` / `#3A1720` | 碳水化合物 |
| `macro.water` | `#0284C7` / `#E0F2FE` | `#38BDF8` / `#102F43` | 饮水 |
| `data-viz.calories` | `#B45309` | `#FBBF24` | 热量主线 |
| `data-viz.comparison` | `#596B32` | `#91A360` | 比较/平均线 |
| `data-viz.annotation` | `#D96343` | `#ED7E5D` | 选中点、注记 |
| `data-viz.baseline` | `#8A817A` | `#8A7F75` | 目标/基准线 |
| `data-viz.grid` | `#E9E3DA` | `#3A332E` | 网格 |
| `data-viz.muted` | `#D6D0C7` | `#4A413A` | 弱化系列 |

宏量色只表示分类，必须同时有名称、数值或图例；不使用绿/红表达达标/失败。

#### Overlay / Focus / Selection / Disabled

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `overlay.scrim` | `rgba(41,35,32,0.42)` | `rgba(0,0,0,0.62)` | Drawer/Dialog 遮罩 |
| `overlay.panel` | `rgba(255,253,249,0.94)` | `rgba(61,52,46,0.96)` | 受限浮层 |
| `focus.color` | `#D97706` | `#FBBF24` | 键盘焦点 |
| `focus.ring` | `rgba(217,119,6,0.24)` | `rgba(251,191,36,0.32)` | 3px 外圈 |
| `selection.background` | `#FEF3C7` | `#4A3414` | 选中行/筛选 |
| `selection.border` | `#D97706` | `#FBBF24` | 选中边界 |
| `disabled.surface` | `#F4F1EC` | `#2C2622` | 不可操作面 |
| `disabled.content` | `#A8A29E` | `#6F665E` | 不可操作文字 |
| `disabled.border` | `#D6D0C7` | `#4A413A` | 不可操作边框 |

### 3.2 Typography

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
```

数字、单位和表格使用 `tabular-nums`；繁中正文使用 Noto Sans TC/PingFang TC/Microsoft JhengHei fallback；长食物名允许换行；文字放大 1.3–1.5 倍时 CTA、状态、单位不截断；中文正文避免大面积 700+。

### 3.3 Spacing

```yaml
spacing: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96]
page-gutter.web: 32px
page-gutter.tablet: 24px
page-gutter.mobile: 16px
section-gap: 32px
major-section-gap: 48px
card-padding: 20px
field-gap: 16px
label-gap: 8px
minimum-target: 48px
```

表格密度：Compact `40–44px` 行、`12px` 水平内距；Regular `48px`/`16px`；Comfortable `56px`/`16–20px`。即使视觉行紧凑，按钮/复选框/链接仍保留至少 48px 可操作目标。

### 3.4 Radius / Shadow / Border

- `radius.field: 14px`、`radius.card/panel: 20px`、`radius.drawer/modal-web: 24px`、`radius.pill: 9999px`。
- `elevation.1: 0 1px 2px rgba(79,54,32,0.06)`；`elevation.2: 0 4px 16px rgba(120,72,28,0.08)`；`elevation.3: 0 12px 32px rgba(120,72,28,0.12)`。
- 默认卡片优先表面+边框，无明显阴影；浮层/Drawer/Dialog 使用 elevation.2/.3。
- 表格容器 20px 外圆角，行内不使用独立圆角；输入 14px；Drawer/Dialog 24px。
- Glass 只允许用于侧栏、辅助面板、轻量浮层；不用于密集表格/主要表单/错误面板。

## 4. Iconography / Illustration

- 首选 Lucide 或同风格圆角线性图标，1.75px stroke，尺寸 16/20/24/32/40px；图标按钮至少 48×48px，必须有 accessible name/tooltip。
- 不用 emoji 作为核心导航、删除、同步、保存、错误或权限图标。
- AI 分析可用 Sparkles/LoaderCircle；待确认 ClipboardCheck；已储存 CheckCircle；失败 AlertCircle；离线 WifiOff；待同步 CloudOff/Clock；冲突 GitCompareArrows/AlertTriangle；所有图标都要配文字。
- 空状态用小型扁平线性插图，颜色限制在暖米/炭/amber/terracotta/olive；不捏造新 Logo/吉祥物；食物照片保留真实感。

## 5. Data Visualization System

- 图表先说明数据，再显示趋势；目标线、平均线、当前值用不同线型/标记；不能只靠颜色。
- 主数据线 2px；比较线 1.5–2px；目标/基准线 1px 虚线；网格线 1px 低对比；数据点默认 4px，hover/focus 6–8px；选择状态用 ring/垂直标记/标签。
- Tooltip 显示日期、名称、完整数值、单位、来源；图例显示色块/线型、名称、单位、当前值；数字使用 tabular-nums。
- 热量用 `data-viz.calories`，目标线用 `data-viz.baseline`，高于目标不染红；文案用「目前记录」「与目标的差距」「约」。
- Macro 使用 protein blue、fat amber、carbs rose、water blue，只表达分类；中心显示总量/日期，不显示健康分数。
- 饮水使用水蓝单系列，目标值用灰虚线/文字；未完成目标仍用中性语言。
- 健康趋势显示期间、来源、更新时间；未授权、已授权无资料、过期、失败必须区分。
- 每个图表提供标题、期间、系列、当前值、范围/平均、目标/比较、趋势文字与可展开数据表。示例：`过去 7 天热量趋势：平均每日约 1,820 kcal，最高为週三 2,040 kcal，最低为週五 1,540 kcal。`
- 图表空/筛选无结果/加载/局部失败分别用空状态、筛选条件与 clear、skeleton、局部错误+重试。

## 6. Component Visual States

### 通用

Hover 仅 Web 辅助，不是唯一入口；Focus 使用 3px focus ring；Pressed 不强烈缩放；Selected 用背景/边框/图标/文字；Disabled 不仅降低 opacity，保留原因；Loading 保留动作文字；Success 说明具体成功但不假定同步完成；Error 说明失败、资料保留与下一步。

### Button

- Default：明确表面、14px 圆角；Hover 100–160ms；Focus 3px ring；Pressed 80–120ms；Selected 用于 toggle/filter。
- Disabled 使用 disabled token；Loading 保留「确认并储存」等文字并禁重复提交；Success 显示 Check +「已储存」后回稳定态；Error 提供「重试储存」。
- 主 CTA：`记录饮食`、`拍照记录`、`确认并储存`、`重试储存`、`立即同步`。

### Input / AI Field

每个字段有 label、单位、必填性、范围和错误关联；默认 surface.default + border.default；Hover 边框增强；Focus ring；AI 预填用 `brand.soft` + `AI 估算`；用户改动显示 `已由你修改`，不是错误；保存失败保留值。

### Card / Chip / Badge

卡片默认 surface + border + 20px；可点击才有 hover/lift；Loading 用内容 skeleton；Error 为局部 danger + 重试，不整卡染红。Chip 高约 32px，筛选显示清除/选中；macro chip 必须显示完整分类名称，不能只用色点。

### Table

语义 `table/thead/tbody/th scope`；默认非 ARIA grid；桌面 sticky header/必要首列；移动优先显示名称/状态/日期等关键列，其余详情 Drawer；选中显示背景、复选框和数量；Loading skeleton rows；Empty 与 Filter-empty 文案分离；批量操作显示数量和取消。

### Navigation / Sidebar

默认炭色文字与低对比图标；Hover surface.subtle/轻 amber/olive；Focus ring；Selected amber/olive 主动背景和 active indicator；导航不使用 protein/fat/carbs 色；状态入口可显示未处理数量/错误标记但仍可进入状态中心。

### Drawer / Dialog

Drawer 使用 `surface.elevated`、24px 外圆角、elevation.3、scrim；焦点进入/循环、Esc 关闭、关闭回触发、dirty 先确认。Dialog 仅删除、冲突、离开未保存、高影响设置；24px、focus trap、destructive 只局部 danger；不承载新增餐点、AI 长审核、长表格。

### AI Draft / Status Center

AI 生命周期的视觉：

| 状态 | 视觉/文案 |
|---|---|
| `captured` | 相片/文字已接收 |
| `uploading` | 上传阶段与可恢复状态 |
| `analyzing` | skeleton + `正在分析这张相片…` |
| `review` | `AI 估算・待确认`，轻 brand.soft |
| `review-unsaved` | `已由你修改`，仍是草稿色，不用 success |
| `saving` | `正在储存餐点…`，禁重复 |
| `saved` | `已储存`，success |
| `offline` | 离线与缓存时间，不伪装服务器储存 |
| `pending-sync` | 本机保留、待同步、重试 |
| `error` | 保留输入，重试或改用手动 |
| `conflict` | 查看差异与选择版本，不自动覆盖 |

状态中心分为「需要你处理 / 处理中 / 稍后重试 / 已完成」，每项显示对象名称、日期、状态、最后更新时间、下一步 CTA。

## 7. Motion Tone

基调是安静、快速、可预测、功能性优先。时长：Hover/Focus 100–160ms；Pressed 80–120ms；状态 160–200ms；Dialog 180–220ms；Drawer 220–320ms；图表/进度 240–400ms；局部进入 180–260ms。Easing：standard `cubic-bezier(0.4,0,0.2,1)`、entrance `cubic-bezier(0,0,0.2,1)`、exit `cubic-bezier(0.4,0,1,1)`。

动效只说明状态/层级/反馈：分析阶段文字+轻 skeleton、保存一次性 check、图表筛选短过渡、Drawer/Dialog 过渡；失败不抖动/闪烁；环境光静态或极低频。

`prefers-reduced-motion`：关闭位移/缩放/抖动/彩虹边框/循环动画；Drawer/Dialog 直接切换或短淡入；图表不自动播放；状态保留文字和静态结构。

禁止：3D、粒子、shader、鼠标追踪、持续视差、彩虹渐变边框、无限品牌动画、大幅 bounce、用动效伪装 AI 可靠性/储存完成。

## 8. Anti-patterns to Avoid

1. 紫色 AI 渐变或霓虹渐变；AI 用轻 amber + `AI 估算`。
2. 全域玻璃；只用于侧栏/辅助面板/轻浮层。
3. 红色表达营养好坏、目标失败、饮食违规；红色只用于真实错误、删除、不可恢复。
4. AI 自动完成/自动覆盖；review、review-unsaved、saved 必须不同。
5. 关键状态只放 Toast；保存失败、权限、同步、AI 未确认必须持久化。
6. Hover-only 交互；关键动作必须可见。
7. 卡片墙、无层级的密集资料、假精确数字、只靠颜色的图表。
8. 只设计成功路径、清空失败输入、把营销页面搬进工作台。
9. 不把 Android/Flutter 底部导航、Material Sheet、原生相机流程混入 Web。

## 9. Design-DNA JSON

```json
{
  "meta": {
    "name": "AI Food Diary Web Warm Evidence Desk",
    "scope": "web-only desktop-first responsive application",
    "source": ["docs/ui-design-system-shared.md", "01-research-report.md", "02-need-report.md", "03-form-report.md"]
  },
  "designSystem": {
    "color": {
      "primary": "#B45309",
      "secondary": "#D96343",
      "accent": "#596B32",
      "lightCanvas": "#FDF6EC",
      "lightSurface": "#FFFFFF",
      "darkCanvas": "#14110F",
      "darkSurface": "#211C19",
      "macro": {"protein":"#0EA5E9", "fat":"#F59E0B", "carbs":"#F43F5E", "water":"#0284C7"},
      "status": {"success":"#059669", "warning":"#D97706", "danger":"#E11D48", "info":"#0284C7"},
      "rule": "semantic colors require text/icon/structure; macro colors never communicate good/bad"
    },
    "typography": {"family":"Plus Jakarta Sans, Noto Sans TC, PingFang TC, Microsoft JhengHei, Noto Sans, Arial, sans-serif", "scale":"display 40/44, h1 32/38, h2 24/30, h3 18/24, body 16/24, small 14/20, caption 12/16", "numeric":"tabular-nums"},
    "spacing": {"base":"4px", "scale":[4,8,12,16,20,24,32,40,48,64,80,96], "desktopGutter":"32px", "target":"48px"},
    "shape": {"field":"14px", "card":"20px", "drawerDialog":"24px", "pill":"9999px"},
    "layout": {"desktop":"sidebar / main / optional auxiliary", "tablet":"collapsed sidebar / main / drawer", "mobileWeb":"top utility / nav drawer / single column", "density":"regular default, compact tables, comfortable forms/mobile"},
    "components": ["AppShell", "PrimarySidebar", "WorkspaceTopbar", "SummaryBand", "MealRhythmRail", "SemanticDataTable", "FilterBar", "CaptureWorkspace", "ReviewWorkspace", "Drawer", "Dialog", "StatusCenter"]
  },
  "designStyle": {
    "mood": ["warm", "calm", "precise", "trustworthy", "non-judgemental"],
    "metaphor": "warm charcoal personal evidence desk",
    "composition": "strict left-aligned grid with restrained asymmetric main/auxiliary balance",
    "hierarchy": "summary to detail through typography, surface contrast, numeric scale and spacing",
    "imagery": "real food photos with neutral crop; small rounded-line illustrations",
    "voice": "Taiwan Traditional Chinese, friendly, direct, non-judgemental",
    "memoryPoint": "Meal Rhythm Rail"
  },
  "visualEffects": {
    "intensity": "subtle-accent",
    "background": "static low-opacity warm ambient fields only",
    "glass": "restricted to navigation, auxiliary panels and light overlays; opaque fallback",
    "motion": {"standard":"100-320ms functional transitions", "reducedMotion":"disable movement, loops and auto-play"},
    "disabled": ["3D", "particles", "shaders", "parallax", "cursor trails", "rainbow borders", "continuous spectacle"]
  }
}
```

## 10. Theme and Contrast Risks

- Light：浅 amber/terracotta/olive 不能作为小字号正文；`content.tertiary` 只用于非核心说明；暖米与 terracotta 接近时用边框/图标/文字补充。
- Dark：`surface.default/subtle/elevated` 明度差需实测；不能直接反转 Light 色；玻璃透明度过高会破坏表格、输入、焦点；阴影不是主要层级手段。
- 必须用工具验证：正文/背景 ≥4.5:1，大字 ≥3:1，按钮文字、focus ring、表格选中、Dialog/Drawer/Overlay/边框、图表线条与状态；CJK fallback 字宽与换行；400%/1.3–1.5x 放大；浏览器高对比度；reduced-motion；屏幕阅读器朗读 AI 估算/用户修改/储存/同步顺序。

## 11. Implementation Notes

- 权威优先级：共享领域状态/文案契约 → `docs/ui-design-system-shared.md` 共享 token → 本报告 Web token/视觉规则 → 组件交互 → 装饰 polish。
- `dashboard/layout.tsx` 从 `max-w-3xl` 约束转为 AppShell；`dashboard-nav.tsx` 由胶囊迁移为 PrimarySidebar；今日页用标题/摘要/Meal Rhythm Rail/辅助状态；MealCaptureForm 分离 Capture/Review；MealList 默认摘要、详情 Drawer；health 使用统一 data-viz；foods 使用语义表格/Filter/批量/Drawer/冲突；settings 分组；DailySummaryPopup 改非阻塞。
- 视觉验收覆盖 360、768、1024、1280、1440px；不横溢、CTA/状态可见、主次层级清楚、移动不缩小文字。
- 该报告仅为设计交接，不包含生产实现。

## 12. External Skills / Sources / Uncertainty

- 已使用 `docs/ui-design-system-shared.md`、上游需求/研究/形态报告，及 `@sentiolabs/pi-frontend-design` 的反 AI-slop原则。
- Design DNA 按 designSystem/designStyle/visualEffects 输出；本轮没有截图采样。
- TinyFish/MCP 不可用，采用等效 Web 搜索/readable fetch；React Bits Magic Bento/Pinterest 动态抓取失败；Awwwards/Godly/Supahero 仅作视觉趋势/限制参考，Mobbin/60fps 用于流程与状态。
- 仍待确认：Logo/品牌图形、深色上线范围、字体授权/加载、AI 信心度算法、图表目标/单位/时区、照片/第三方 AI 隐私、低端设备 glass 性能、Health Connect Web 展示范围。
