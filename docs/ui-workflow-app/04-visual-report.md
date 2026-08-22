# UI 视觉表现分析报告

> 范围：仅面向 Flutter Android 手机原生体验；不设计 Web、平板或 HTML，不修改生产代码。本文以 `docs/ui-design-system-shared.md`、需求报告、研究报告和形态报告为约束。

## 一、设计语言总纲

- **风格定位**：以暖琥珀为行动锚点、以不透明 Material 3 表面承载可信数据的低负担饮食记录体验。
- **关键词**：温暖 / 克制 / 可信 / 可编辑 / 行动导向。
- **视觉记忆点**：
  1. **暖琥珀确认线**：`brand.primary` 只用于当前行动、选中导航和确认储存。
  2. **AI 可确认草稿**：使用轻量 `brand.soft` 表面与 `AI 估算・待確認` 标签，明确 AI 不是最终裁判。
  3. **餐点时间线**：餐点以清晰、连续、可回顾的记录单元呈现，而不是复杂数据仪表盘。
- **情绪板**：温暖纸张色背景、自然餐点相片、清晰字段标签、细边框、不透明卡片、少量橄榄绿与陶土色辅助强调；像一本可靠但不严肃的随身健康记录本。
- **Android 身份**：使用 Material 3 NavigationBar、Bottom Sheet、系统相机、系统返回和 Insets；保持单列、单手可达、固定底部行动区；不把 Web 侧栏、四 Tab、表格和多栏仪表盘缩小到手机；默认无动态背景、玻璃模糊、3D、粒子和营销页渐变。

## 二、Design Tokens

### 配色

共享系统的核心值必须保持不变；以下扩展色阶只用于实现时的状态与层级，不改变共享语义。

```yaml
primary:
  light:
    50: "#FFF7ED"
    100: "#FEF3C7"
    200: "#FED7AA"
    300: "#FDBA74"
    400: "#D97706"
    500: "#B45309"
    600: "#92400E"
    700: "#78350F"
    800: "#5F2608"
    900: "#431B05"
    950: "#2A1003"
  dark:
    50: "#FFF7ED"
    100: "#FEF3C7"
    200: "#FDE68A"
    300: "#FCD34D"
    400: "#FBBF24"
    500: "#F59E0B"
    600: "#D97706"
    700: "#92400E"
    800: "#5C2A06"
    900: "#351803"
    950: "#1A1006"
secondary:
  terracotta:
    light: "#D96343"
    dark: "#ED7E5D"
  olive:
    light: "#596B32"
    dark: "#91A360"
neutral:
  light:
    canvas: "#FDF6EC"
    scaffold: "#FAF8F5"
    surface: "#FFFFFF"
    subtle: "#F4F1EC"
    border: "#E9E3DA"
    tertiary: "#8A817A"
    secondary: "#57534E"
    primary: "#292320"
  dark:
    canvas: "#14110F"
    scaffold: "#14110F"
    surface: "#211C19"
    subtle: "#2C2622"
    elevated: "#3D342E"
    border: "#3A332E"
    tertiary: "#8A7F75"
    secondary: "#B8AFA5"
    primary: "#F5F0EA"
semantic:
  success: { light: "#059669", light_surface: "#ECFDF5", dark: "#34D399", dark_surface: "#0E2A1E" }
  warning: { light: "#D97706", light_surface: "#FFFBEB", dark: "#FBBF24", dark_surface: "#2A2012" }
  danger: { light: "#E11D48", light_surface: "#FFF1F2", dark: "#FB7185", dark_surface: "#2E1416" }
  info: { light: "#0284C7", light_surface: "#F0F9FF", dark: "#38BDF8", dark_surface: "#0E2230" }
macro:
  protein: { main: "#0EA5E9", light_surface: "#E0F2FE", dark_surface: "#102F43" }
  fat: { main: "#F59E0B", light_surface: "#FEF3C7", dark_surface: "#3A2B0D" }
  carbs: { main: "#F43F5E", light_surface: "#FFE4E6", dark_surface: "#3A1720" }
  water: { main: "#0284C7", light_surface: "#E0F2FE", dark_surface: "#102F43" }
```

**规则**：营养色只表达分类，不表达好坏；必须同时出现名称、数值或图例；Amber 不用于浅色小字号正文；状态必须配合图标、文字或结构；Android 表面默认不透明，不使用全局渐变和玻璃模糊。

### 字体

```yaml
font_family:
  sans: "Plus Jakarta Sans, Noto Sans TC, PingFang TC, Microsoft JhengHei, Noto Sans, Arial, sans-serif"
  mono: "JetBrains Mono, SFMono-Regular, Roboto Mono, Consolas, monospace"
type_scale:
  display: "40sp/44sp 800"
  h1: "32sp/38sp 800"
  h2: "24sp/30sp 750"
  h3: "18sp/24sp 700"
  body: "16sp/24sp 450"
  body_medium: "16sp/24sp 600"
  small: "14sp/20sp 500"
  caption: "12sp/16sp 600"
  overline: "11sp/14sp 700"
```

正文使用 450–600 字重，繁体中文避免大面积过重；数字使用 `tabular-nums`；字体放大 1.3–1.5 倍时关键 CTA、单位和状态不得截断。正式 UI 用台湾繁体中文，如 `AI 估算・待確認`、`確認並儲存`。

### 间距、圆角、边框

```yaml
spacing_scale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96]
android:
  page_gutter: "16dp"
  section_gap: "24dp"
  card_padding: "16dp"
  field_gap: "14dp"
  list_row_gap: "8dp"
  minimum_touch_target: "48dp"
radius:
  sm: "8dp"
  field: "14dp"
  card: "20dp"
  sheet: "28dp"
  dialog: "24dp"
  pill: "9999dp"
border:
  default: "1dp solid border.default"
  focus: "2dp border.focus + 3dp equivalent focus halo"
  divider: "1dp solid border.default"
```

### 阴影与层级

```yaml
elevation:
  0: "无阴影；使用 surface + border 区分"
  1: "0 1px 2px rgba(79,54,32,0.06)"
  2: "0 4px 16px rgba(120,72,28,0.08)"
  3: "0 12px 32px rgba(120,72,28,0.12)"
  focus: "0 0 0 3px rgba(217,119,6,0.24)"
```

普通卡片不默认使用阴影；elevation 只用于 Sheet、Dialog、拖拽对象和临时浮层；深色模式优先使用表面层级而不是黑色重阴影。

### 触控、安全区、图标

```yaml
touch:
  minimum_target: "48dp × 48dp"
  primary_button_height: "52dp"
  input_height: "56dp"
  list_row_min_height: "64dp"
  icon_button_box: "48dp"
system_insets:
  status_bar: "内容不得覆盖；AppBar 使用 top inset"
  navigation_bar: "底部 CTA 与 NavigationBar 避让 bottom inset"
  gesture_area: "固定 CTA 额外保留 gesture inset"
  display_cutout: "刘海与横向 cutout 不放关键文字/按钮"
  ime: "键盘出现时 CTA 上移或转为键盘上方固定区域"
```

图标使用 Material Symbols Rounded 或同风格圆角线性图标；默认 24dp，辅助 20dp，空状态 32–40dp，约 2dp 线宽；核心操作不用 Emoji；图标按钮必须有无障碍名称；图标不能替代 `儲存` 等关键文字。

## 三、组件级视觉规范

| 组件 | 视觉规范 |
|---|---|
| NavigationBar | 约 80dp + 底部系统 Insets；固定 `飲食 / 健康 / 設定`。Material indicator + 品牌色，图标 24dp，标签 12–14sp；不得使用宏量色。 |
| AppBar | 约 64dp；返回按钮 48dp；标题 h3；子页有可见返回按钮，不依赖边缘手势。 |
| 今日摘要 | 20dp 圆角；中性表面或单一深炭/深橄榄锚点；显示日期、已记录数量、核心摘要与更新时间，不显示羞辱性评分。 |
| AI 草稿 | `brand.soft` 背景与 1dp 品牌边框；顶部 `AI 估算・待確認`；用户修改显示 `已由你修改`。 |
| 状态卡/横幅 | 相关页面持久存在；图标、状态、对象和下一步 CTA；关键错误不能只 Snackbar。 |
| 宏量指标 | 显示名称、数值、单位、图例；营养色只分类，不表示好坏。 |
| 餐点列表 | 不透明表面、细边框/分隔线；自然相片缩略图；状态和时间清晰，不依赖长按编辑。 |
| 输入字段 | 56dp 高；始终有 label、单位、范围、错误；AI 估算和用户修改有不同辅助标签。 |
| 固定 CTA | 表面背景 + 1dp 顶部分隔线；主按钮 52dp；保留 `確認並儲存`、`重試儲存` 文案；避让键盘、手势、导航。 |
| Bottom Sheet | 顶部圆角 28dp，拖曳把手约 32×4dp；只放记录来源、短筛选、短确认。 |
| Dialog | 只用于删除、冲突、不可逆或明确权限确认；不自动弹出昨日记录；必须有取消与替代。 |
| Empty | 短说明、静态线性插图、一个主 CTA，例如 `今天還沒有飲食紀錄` + `記錄飲食`。 |
| Error | 局部 danger 表面；说明资料是否保留并提供 `重試`、`改用手動記錄` 或 `稍後處理`。 |
| Offline | info/neutral 横幅：`目前離線；最後同步於 12:30`；不得伪装服务器已储存。 |
| Sync | 区分 `待同步`、`同步中`、`同步未完成`、`已同步`；显示对象、最后更新时间和下一步。 |
| 图表 | 160–220dp 高；数据点有文字/TalkBack 描述；提供图例、网格、单位、时间范围。 |
| 健康指标 | 中性摘要、进度、趋势；使用 `目前進度`、`與目標的差距`、`記錄中`，避免 `超標`、`不及格`。 |

### Flutter token 命名建议

```text
AppColors.brandPrimary
AppColors.brandPrimaryPressed
AppColors.brandSoft
AppColors.accentTerracotta
AppColors.accentOlive
AppColors.surfaceCanvas
AppColors.surfaceScaffold
AppColors.surfaceDefault
AppColors.surfaceSubtle
AppColors.surfaceElevated
AppColors.contentPrimary
AppColors.contentSecondary
AppColors.contentTertiary
AppColors.borderDefault
AppColors.borderFocus
AppColors.statusSuccess
AppColors.statusWarning
AppColors.statusDanger
AppColors.statusInfo
AppColors.macroProtein
AppColors.macroFat
AppColors.macroCarbs
AppColors.macroWater
AppSpacing.pageGutter
AppSpacing.sectionGap
AppSpacing.cardPadding
AppSpacing.fieldGap
AppSpacing.touchTarget
AppRadius.field
AppRadius.card
AppRadius.sheet
AppRadius.dialog
AppRadius.pill
AppElevation.none
AppElevation.sheet
AppElevation.dialog
AppElevation.dragged
AppMotion.micro
AppMotion.normal
AppMotion.sheet
AppMotion.reduced
AppTextStyles.display
AppTextStyles.h1
AppTextStyles.h2
AppTextStyles.h3
AppTextStyles.body
AppTextStyles.bodyMedium
AppTextStyles.small
AppTextStyles.caption
AppTextStyles.overline
```

## 四、关键页面视觉层级

### 今日
主视觉为日期、更新时间和今日摘要；首屏只突出一个 `記錄飲食` 行动，其他为状态、餐点、历史与回馈入口；不堆大量健康卡。

### 记录来源 Sheet
标题 `選擇記錄方式`；四个等权选项 `拍照`、`從相簿選擇`、`文字描述`、`手動輸入`；每个至少 56dp，不用颜色暗示哪种方式更正确。

### 描述/手动
视觉重心是输入内容和底部 CTA；默认名称、份量、单位；营养字段渐进展开；全屏、安静、键盘友好。

### AI 分析
以静态相片预览、轻量骨架、阶段性文字表达 `已收到相片`、`正在辨識餐點`、`整理份量與營養`；持续强调分析完成不等于储存。

### AI 审核
`brand.soft` 只标记草稿，不制造发光或“AI 魔法”；主显示名称、份量、热量，展开显示宏量、来源、`已由你修改`；固定 `確認並儲存`。

### 餐点详情
主为餐点、相片、时间、热量和正式状态；次为食物项目和宏量；辅助为来源、AI 估算、用户修改、同步；用户编辑值不能继续表现为 AI 估算。

### 健康
主为资料是否可用与更新时间；次为营养趋势、饮水、体重、活动；辅助为 Health Connect 授权/数据来源；小屏单列，大屏手机最多两列，不用红绿评分。

### 设置
使用标准 Material 列表；主为资料、AI、连接同步、隐私，辅以状态和更新时间；危险操作单独分组。

### 我的食物
主为搜索、最近使用和可见选取动作；次为常用/收藏；辅为营养、来源、编辑；必须有 `選取`/Checkbox，不依赖长按。

## 五、动效与反馈

```yaml
motion:
  press: "80-120ms"
  focus: "100-160ms"
  state: "160-200ms"
  dialog: "180-220ms"
  sheet: "220-320ms"
  chart: "240-400ms"
  enter_easing: "cubic-bezier(0.2, 0, 0, 1)"
  exit_easing: "cubic-bezier(0.3, 0, 1, 1)"
  state_easing: "cubic-bezier(0.4, 0, 0.2, 1)"
```

进入使用淡入 + 4–8dp 位移；退出使用淡出/短位移，不弹跳。AI 必须使用阶段文字、轻骨架、确定性进度；Spinner 只能辅助。储存按钮保留 `確認並儲存`，进入 `正在儲存…`，成功后写入稳定 `已儲存`；失败显示 `儲存未完成，草稿仍保留`。Tab 轻淡入，Sheet 从底部进入。

Reduced Motion 关闭位移、缩放、抖动、循环脉冲和无限动画，但保留静态进度、阶段文字、图标与状态信息。

## 六、特殊效果与性能预算

Android 默认不启用 WebGL、Canvas 装饰动画、粒子、Shader、3D、持续视差、鼠标追踪或玻璃拟态。允许：Material 不透明表面分层、静态阶段列表/轻骨架、标准数据图表。首屏不加载装饰动态效果；目标 60fps（约 16.7ms/帧）；同时动画区域不超过 2 个；缩略图约 512px 级；低端设备回退到静态表面、静态图表和系统过渡。

## 七、Design DNA JSON

```json
{
  "meta": {
    "name": "AI Food Diary Android Native Warm Trustworthy",
    "description": "面向 Flutter Android 手机的低负担 AI 饮食记录视觉 DNA。以共享设计系统为基础，强调 AI 草稿可编辑、用户确认后储存、离线可恢复和健康语境中的非评判表达。",
    "source_references": [
      "docs/ui-design-system-shared.md",
      "ui-need-analyst 需求报告",
      "ui-form-analyst 形态报告",
      "ui-research-analyst 研究报告"
    ],
    "created_at": "session-generated"
  },
  "design_system": {
    "color": {
      "palette_type": "warm complementary with neutral-first surfaces",
      "primary": { "hex": "#B45309", "dark_hex": "#FBBF24", "role": "主要 CTA、选中导航、确认和当前行动锚点" },
      "secondary": { "terracotta": { "hex": "#D96343", "dark_hex": "#ED7E5D", "role": "食物、生活方式和次级提醒" } },
      "accent": { "olive": { "hex": "#596B32", "dark_hex": "#91A360", "role": "健康语境、稳定和完成的辅助强调" } },
      "surface": {
        "canvas": { "light": "#FDF6EC", "dark": "#14110F" },
        "scaffold": { "light": "#FAF8F5", "dark": "#14110F" },
        "default": { "light": "#FFFFFF", "dark": "#211C19" },
        "subtle": { "light": "#F4F1EC", "dark": "#2C2622" },
        "elevated": { "light": "#FFFDF9", "dark": "#3D342E" }
      },
      "content": {
        "primary": { "light": "#292320", "dark": "#F5F0EA" },
        "secondary": { "light": "#57534E", "dark": "#B8AFA5" },
        "tertiary": { "light": "#8A817A", "dark": "#8A7F75" }
      },
      "border": { "default": { "light": "#E9E3DA", "dark": "#3A332E" }, "focus": { "light": "#D97706", "dark": "#FBBF24" } },
      "semantic": {
        "success": { "light": "#059669", "light_surface": "#ECFDF5", "dark": "#34D399", "dark_surface": "#0E2A1E" },
        "warning": { "light": "#D97706", "light_surface": "#FFFBEB", "dark": "#FBBF24", "dark_surface": "#2A2012" },
        "error": { "light": "#E11D48", "light_surface": "#FFF1F2", "dark": "#FB7185", "dark_surface": "#2E1416" },
        "info": { "light": "#0284C7", "light_surface": "#F0F9FF", "dark": "#38BDF8", "dark_surface": "#0E2230" }
      },
      "macro": {
        "protein": { "main": "#0EA5E9", "light_surface": "#E0F2FE", "dark_surface": "#102F43" },
        "fat": { "main": "#F59E0B", "light_surface": "#FEF3C7", "dark_surface": "#3A2B0D" },
        "carbs": { "main": "#F43F5E", "light_surface": "#FFE4E6", "dark_surface": "#3A1720" },
        "water": { "main": "#0284C7", "light_surface": "#E0F2FE", "dark_surface": "#102F43" }
      },
      "contrast_strategy": "opaque tonal layers with text, icon, and structure for every critical state"
    },
    "typography": {
      "font_families": {
        "heading": "Plus Jakarta Sans, Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif",
        "body": "Plus Jakarta Sans, Noto Sans TC, PingFang TC, Microsoft JhengHei, Noto Sans, Arial, sans-serif",
        "mono": "JetBrains Mono, SFMono-Regular, Roboto Mono, Consolas, monospace"
      },
      "scale": { "display": "40sp/44sp 800", "h1": "32sp/38sp 800", "h2": "24sp/30sp 750", "h3": "18sp/24sp 700", "body": "16sp/24sp 450", "small": "14sp/20sp 500", "caption": "12sp/16sp 600", "overline": "11sp/14sp 700" },
      "notes": "繁中正文不大面积使用重字重；数字使用 tabular-nums；支持 1.3–1.5 倍系统字体"
    },
    "spacing": { "base_unit": "4dp", "scale": ["4dp", "8dp", "12dp", "16dp", "20dp", "24dp", "32dp", "40dp", "48dp", "64dp", "80dp", "96dp"], "gutter": "16dp", "content_density": "comfortable" },
    "shape": { "small": "8dp", "field": "14dp", "card": "20dp", "sheet": "28dp", "dialog": "24dp", "pill": "9999dp", "border": "1dp subtle" },
    "elevation": { "style": "minimal soft Material elevation", "levels": { "low": "0 1px 2px rgba(79,54,32,0.06)", "medium": "0 4px 16px rgba(120,72,28,0.08)", "high": "0 12px 32px rgba(120,72,28,0.12)" } },
    "iconography": { "style": "rounded linear Material Symbols", "sizes": ["16dp", "20dp", "24dp", "32dp", "40dp"], "stroke": "approximately 2dp" },
    "motion": { "durations": { "micro": "80-160ms", "normal": "160-220ms", "sheet": "220-320ms", "chart": "240-400ms" }, "reduced_motion": "static progress and text states" },
    "components": { "navigation": "three-item Material 3 NavigationBar", "button": "52dp opaque branded action", "input": "56dp labeled field with units", "card": "20dp opaque surface with subtle border", "modal": "opaque 28dp Sheet for short tasks; full-screen for complex tasks", "critical_state": "persistent and actionable" }
  },
  "design_style": {
    "mood": ["warm", "calm", "trustworthy", "non-judgmental", "precise"],
    "visual_metaphor": "a reliable pocket food journal with an assistant annotation layer",
    "genre": "calm health utility and personal data journal",
    "personality": ["approachable", "honest", "patient", "meticulous", "supportive"],
    "complexity": "minimal to moderate",
    "ornamentation": "subtle accents only",
    "whitespace": "comfortable with deliberate separation between primary action, state, and details",
    "composition": "vertical single-column task flow with a stable bottom action zone",
    "imagery": "natural food photos with honest crops and no dramatic filters",
    "interaction_feel": "persistent, calm, specific, actionable feedback",
    "brand_voice": "friendly professional Taiwan Traditional Chinese; direct action labels; explain what happened, retained data, and recovery"
  },
  "visual_effects": {
    "overview": { "effect_intensity": "subtle-accent", "performance_tier": "lightweight", "fallback": "static opaque surfaces and native transitions" },
    "background_effects": { "enabled": false, "type": "none", "description": "static warm canvas" },
    "particle_systems": { "enabled": false, "type": "none" },
    "3d_elements": { "enabled": false, "type": "none" },
    "shader_effects": { "enabled": false, "type": "none" },
    "scroll_effects": { "enabled": false, "parallax": false, "morphing": false },
    "text_effects": { "enabled": false, "type": "none" },
    "cursor_effects": { "enabled": false, "type": "none" },
    "image_effects": { "enabled": false, "type": "natural photo crop" },
    "glassmorphism": { "enabled": false, "type": "none" },
    "canvas_drawings": { "enabled": false, "type": "standard charts only" },
    "svg_animations": { "enabled": false, "type": "static illustration" },
    "composite_notes": "视觉重点来自品牌色、暖色表面、清晰文字和可恢复状态，而不是特殊渲染；Reduced Motion、省电和低端设备均回退静态。"
  }
}
```

## 八、与其它报告的呼应与风险

- **记录不是负担**：单一主行动、舒适间距、渐进展开、固定 CTA。
- **AI 是助手不是裁判**：AI 内容标记估算/待确认，保留用户修改。
- **数据服务于行动**：摘要旁必须有下一步，不展示空分数。
- **温暖而可信**：暖中性色和琥珀建立温度，边框、时间、来源、同步建立可信度。
- **平台化而非复制 Web**：共享颜色、字体、状态语义；Android 采用 NavigationBar、Insets、系统相机、Sheet、返回和单手 CTA。

风险：AI 高饱和“完成式”视觉会让用户跳过确认；红色评分会制造焦虑；本机/账号/同步状态混淆；繁中长词和大字造成截断；相片和图表引起性能问题；敏感资料不得进入装饰性日志或调试视觉。

假设：Android 继续 Flutter Material 3 与现有主题；当前以台湾繁中为基准；分析/保存失败可恢复；Health Connect 拒绝不阻塞饮食；P2 功能未上线前不成为主要入口。

给 IA/交互/内容：保持三 Tab；关键动作有可见按钮；统一 `儲存`、`飲食紀錄`、`餐點`、`相片`、`AI 估算`、`待同步`；状态不可只靠颜色；不引入紫色渐变、重玻璃、3D、粒子、持续视差、游戏化分数或无意义多色装饰。
