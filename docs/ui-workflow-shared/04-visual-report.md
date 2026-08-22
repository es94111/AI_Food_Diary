# UI 视觉表现分析报告

> 阶段：深度模式 · 跨平台 Design DNA 与 design tokens

## 一、设计语言总纲

**风格定位**：温暖米色基底上的专业营养工具感，兼具健康生活方式的亲和力与健身数据产品的精确度。

**关键词**：温暖、专业、可编辑、清晰、有节制。

**品牌核心**：
1. 记录不是负担：拍照、手动输入和修正都应轻松。
2. AI 是助手，不是裁判：AI 结果始终是可编辑草稿。
3. 数据服务于行动：数据需要转化为可理解的下一步。
4. 稳定可信：颜色、数字、状态和反馈跨平台保持一致。
5. 不制造焦虑：异常、未达标和缺漏使用建设性语言。

**情绪板**：暖米色餐桌、自然光食物照片、深橄榄/炭黑文字、陶土/琥珀强调色、轻微纸张或玻璃质感、清楚但不冰冷的数据图表；像值得长期使用的健康笔记本，而不是医疗仪器或竞技后台。

视觉原则：低饱和暖中性色占大面积；食物照片和用户输入是视觉焦点；字号、留白和颜色权重优先于复杂阴影；AI 草稿可编辑但不呈现为错误；Web 可有限使用环境光/玻璃，Android 优先原生 Material surface，避免重度模糊。

## 二、现有系统继承与统一

- Web `src/app/globals.css`：`#fdf6ec` 暖背景、amber/orange/pink 环境光、`.glass`/`.glass-dark`、Plus Jakarta Sans、`prefers-reduced-motion`。
- Flutter `mobile/lib/theme/app_theme.dart`：light/dark `AppPalette`、amber brand、protein/fat/carbs、success/danger/water、card 20、field 14、chip 全圆角、Material Theme Extension。
- 本规范保留方向，但收敛为跨平台 semantic tokens；高饱和多色光晕、透明玻璃和动态边框只能作为装饰，不承载关键数据、图表或状态。

## 三、Design Tokens

### 基础色阶（建议）

```yaml
primary: {50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f", 950: "#451a03"}
neutral: {0: "#fffdf9", 50: "#faf8f5", 100: "#f4f1ec", 200: "#e9e3da", 300: "#d8cfc5", 400: "#b8afa5", 500: "#8a817a", 600: "#6b625b", 700: "#57534e", 800: "#3d3732", 900: "#292320", 950: "#14110f"}
olive: {50: "#f5f7ed", 100: "#e8edd7", 200: "#d4dfb9", 300: "#b6c58e", 400: "#91a360", 500: "#718342", 600: "#596b32", 700: "#465529", 800: "#374321", 900: "#2b351c", 950: "#171d10"}
terracotta: {50: "#fff5ef", 100: "#ffe6d5", 200: "#fec9ad", 300: "#f9a47f", 400: "#ed7e5d", 500: "#d96343", 600: "#bd4d34", 700: "#9c3e2d", 800: "#81352a", 900: "#6b3028", 950: "#3a1714"}
protein: {50: "#f0f9ff", 100: "#e0f2fe", 200: "#bae6fd", 300: "#7dd3fc", 400: "#38bdf8", 500: "#0ea5e9", 600: "#0284c7", 700: "#0369a1", 800: "#075985", 900: "#0c4a6e", 950: "#082f49"}
fat: {50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f", 950: "#451a03"}
carbs: {50: "#fff1f2", 100: "#ffe4e6", 200: "#fecdd3", 300: "#fda4af", 400: "#fb7185", 500: "#f43f5e", 600: "#e11d48", 700: "#be123c", 800: "#9f1239", 900: "#881337", 950: "#4c0519"}
success: {50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b", 950: "#022c22"}
```

### 浅色语义 token

```yaml
light:
  surface: {canvas: "#fdf6ec", scaffold: "#faf8f5", surface: "#ffffff", subtle: "#f4f1ec", muted: "#eee9e2", elevated: "#fffdf9", inverse: "#292320"}
  content: {primary: "#292320", secondary: "#57534e", tertiary: "#8a817a", disabled: "#b8afa5", inverse: "#fffdf9", brand: "#92400e", link: "#9c3e2d"}
  border: {subtle: "#eee9e2", default: "#e9e3da", strong: "#d8cfc5", focus: "#d97706"}
  brand: {primary: "#b45309", hover: "#92400e", pressed: "#78350f", soft: "#fef3c7", onPrimary: "#ffffff"}
  status: {success: "#059669", successSurface: "#ecfdf5", successBorder: "#a7f3d0", successContent: "#065f46", warning: "#d97706", warningSurface: "#fffbeb", warningBorder: "#fcd34d", warningContent: "#78350f", danger: "#e11d48", dangerSurface: "#fff1f2", dangerBorder: "#fda4af", dangerContent: "#9f1239", info: "#0284c7", infoSurface: "#f0f9ff", infoBorder: "#7dd3fc", infoContent: "#075985"}
  data: {protein: "#0ea5e9", proteinSurface: "#e0f2fe", fat: "#f59e0b", fatSurface: "#fef3c7", carbs: "#f43f5e", carbsSurface: "#ffe4e6", water: "#0284c7", waterSurface: "#e0f2fe"}
```

### 深色语义 token

深色模式不是反转：

```yaml
dark:
  surface: {canvas: "#14110f", scaffold: "#14110f", surface: "#211c19", subtle: "#2c2622", muted: "#352e29", elevated: "#3d342e", inverse: "#faf8f5"}
  content: {primary: "#f5f0ea", secondary: "#b8afa5", tertiary: "#8a7f75", disabled: "#6b625b", inverse: "#292320", brand: "#fcd34d", link: "#fbbf24"}
  border: {subtle: "#302925", default: "#3a332e", strong: "#51473f", focus: "#fbbf24"}
  brand: {primary: "#fbbf24", hover: "#fcd34d", pressed: "#f59e0b", soft: "#2a2012", onPrimary: "#1a1614"}
  status: {success: "#34d399", successSurface: "#0e2a1e", successBorder: "#166534", successContent: "#a7f3d0", warning: "#fbbf24", warningSurface: "#2a2012", warningBorder: "#5a4514", warningContent: "#fde68a", danger: "#fb7185", dangerSurface: "#2e1416", dangerBorder: "#7f1d1d", dangerContent: "#fecdd3", info: "#38bdf8", infoSurface: "#0e2230", infoBorder: "#155e75", infoContent: "#bae6fd"}
  data: {protein: "#38bdf8", proteinSurface: "#102f43", fat: "#fbbf24", fatSurface: "#3a2b0d", carbs: "#fb7185", carbsSurface: "#3a1720", water: "#38bdf8", waterSurface: "#102f43"}
```

### 宏量营养素语义

| 语义 | 主色 | 浅色背景 | 深色背景 |
|---|---|---|---|
| Protein | `#0EA5E9` | `#E0F2FE` | `#102F43` |
| Fat | `#F59E0B` | `#FEF3C7` | `#3A2B0D` |
| Carbs | `#F43F5E` | `#FFE4E6` | `#3A1720` |
| Water | `#0284C7` | `#E0F2FE` | `#102F43` |

宏量色是中性分类，不表达好坏；须同时给文字、数值或图例，不能只靠色彩。

### 字体

```yaml
font_family:
  sans: "'Plus Jakarta Sans', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans', Arial, sans-serif"
  mono: "'JetBrains Mono', 'SFMono-Regular', 'Roboto Mono', Consolas, monospace"
type_scale:
  display: "40px/44px 800"
  h1: "32px/38px 800"
  h2: "24px/30px 750"
  h3: "18px/24px 700"
  body: "16px/24px 450"
  bodyMedium: "16px/24px 600"
  small: "14px/20px 500"
  caption: "12px/16px 600"
  overline: "11px/14px 700"
  numericLarge: "40px/44px 800"
  numericMedium: "24px/30px 750"
```

Plus Jakarta Sans 负责拉丁字母、数字与品牌气质；繁中 fallback 依次为 Noto Sans TC、PingFang TC、Microsoft JhengHei、Noto Sans。繁中正文不建议 800；营养数字使用 `tabular-nums`。Android 是否内置 Noto Sans TC 需在字体授权、包体与跨设备一致性之间验证。

### 间距、圆角、层级

```yaml
spacing: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96]
usage: {iconToLabel: 8, fieldHorizontal: 16, fieldVertical: 14, cardCompact: 16, cardDefault: 20, cardLarge: 24, sectionSmall: 24, sectionDefault: 32, sectionLarge: 48, pageEdgeWeb: 32, pageEdgeAndroid: 16, minTouchTarget: 48}
radius: {xs: 4, sm: 8, md: 12, field: 14, lg: 20, xl: 24, pill: 9999, media: 16, modalWeb: 24, sheetAndroid: 28}
elevation:
  0: none
  1: "0 1px 2px rgba(79,54,32,0.06)"
  2: "0 4px 16px rgba(120,72,28,0.08)"
  3: "0 12px 32px rgba(120,72,28,0.12)"
  focus: "0 0 0 3px rgba(217,119,6,0.24)"
```

默认卡片优先边框和表面差异；阴影只用于浮起、弹窗、Sheet 和拖拽对象；Material surface container 优先于 Android 玻璃效果。

### 图标

圆角线性图标，Web 1.75px、Android 约 2px；尺寸 16/20/24/32/40；Web 可用 Lucide 或同风格集合，Android 可用 Material Symbols Rounded；共享语义映射。核心导航和操作不用 emoji；图标按钮至少 `48×48px`，不能独立表达关键状态。

## 四、关键页面视觉构图

- **饮食日记**：视觉重心为今日进度、最近一餐和“记录一餐”；深炭/深橄榄锚点 + 小面积 amber + 宏量色条/图例；无记录时提供温暖低对比插图/食物图和主 CTA。
- **拍照/手动入口**：相机为主行动；其他入口中性且可发现；权限/处理中就地状态；Web 不扩大噪音，Android 保持单手可达。
- **AI 草稿审核**：图片、识别食物、份量、置信信息为主；可编辑字段用细边框/focus ring；AI 草稿用轻 Amber/中性标记，不用危险红；用户调整与 AI 值明确区分。
- **保存确认**：突出变更后的值和“确认并保存”；成功用短暂绿色状态，不用夸张庆祝；手动修改标记“已调整”。
- **健康趋势**：强调当前值和结论；图表网格中性、数据线语义色；未同步优先灰/蓝信息态，异常才使用红。
- **食物资产/设置**：降低装饰和光晕；清楚分组、分隔线、风险操作；缩略图不得抢过名称与营养。

## 五、动效与平台表面

- 缓动：常规 `cubic-bezier(0.4,0,0.2,1)`；进入 `cubic-bezier(0.2,0.8,0.2,1)`；弹性只用于短反馈。
- 时长：hover/focus 100–160ms；按下 80–120ms；状态 160–200ms；面板 220–320ms；进度/图表 240–400ms。
- 进入：fade + 4–8px 位移；AI 处理用骨架/脉冲/渐进字段，不用无限 spinner 为唯一提示；保存成功可一次性勾选。
- reduced motion：Web 遵守 `prefers-reduced-motion`，Flutter 响应 `MediaQuery.disableAnimations`/系统等效状态；动画不能是状态唯一表达。
- Web 可使用低透明度暖环境光（总强度 0.12–0.24、28–36s）和有限 frosted surface（blur 16–24px）；Android 默认静态暖表面和 Material 3，不全局移植 glass。
- 不引入 WebGL、3D、粒子、鼠标追踪、强色散、shader 或持续变形。

## 六、Design DNA JSON

完整机器可读 DNA 详见本报告原始生成稿的结构化内容；核心如下：

```json
{
  "name": "AI Food Diary Warm Professional Cross-platform DNA",
  "palette": "warm analogous with amber, terracotta, olive and cool data accents",
  "primary": "#B45309",
  "secondary": "#596B32",
  "accent": "#D96343",
  "font": "Plus Jakarta Sans + Noto Sans TC/PingFang TC/Microsoft JhengHei fallback",
  "spacingBase": "4px",
  "radii": {"field": "14px", "card": "20px", "modal": "24px", "sheet": "28px", "pill": "9999px"},
  "macroColors": {"protein": "#0EA5E9", "fat": "#F59E0B", "carbs": "#F43F5E", "water": "#0284C7"},
  "motion": "minimal functional motion with warm feedback",
  "effects": {"webAmbientLight": "optional", "webGlass": "limited", "androidGlass": false, "particles": false, "3d": false, "shaders": false},
  "interactionPersonality": ["immediate", "explicit", "reassuring", "non-judgmental", "editable-first"]
}
```

## 七、组件变体与状态

### Button
Primary（拍照/确认并保存）、Secondary（手动/详情）、Outline（编辑/取消）、Ghost（撤销/关闭）、Destructive（删除/清除）、Icon-only（相机/编辑/关闭）。状态包括 default、hover、pressed、focused、disabled、loading、success；主操作触控区域至少 48px，focus ring 至少 3px。

### Input / AI Field
Default、Focus、AI generated（轻 `primary_soft` + AI 标签）、User edited（“已调整”，非错误色）、Validation warning、Error、Read-only。AI 值和用户值必须可区分。

### Card
Default、Elevated、Hero Summary、Macro、AI Draft、Empty、Error。卡片默认 20px 圆角，弱边框；错误卡局部使用 danger，不整页染红。

### Chip / Badge
Macro、Status、AI、Filter；最小高度约 32px；不把 chip 当主要动作。

### Navigation
Web active 使用 amber/深橄榄表面；Android selected 使用 Material indicator + amber icon/label；导航不使用 macro 色，避免语义混淆。

### Toast/Snackbar
成功、信息、警告、错误均需说明发生了什么和用户可做什么；关键错误不能只存在于 Snackbar。

## 八、反模式、优先级和风险

反模式：每张卡不同背景、所有未达标红色、AI 结果作为事实、只用颜色、Android 复制 Web glass、主操作同权重、持续动画、纯黑背景、繁中标题过重、羞辱文案、空状态无行动、Android 依赖 hover、巨大发光掩盖层级。

实施优先级：
- P0：统一 light/dark semantic token、字体/数字、圆角/间距/触控/focus、AI 草稿/用户调整/确认状态、导航 active 语义。
- P1：记录入口、AI 编辑字段、确认保存、热量/宏量、空/载入/错误、Web glass/Android Material 适配。
- P2：趋势图、食物资产、设置、图片与空状态插画、环境光和 SVG 非关键动画。

风险：字体 fallback 宽度；Amber 对比度；深色宏量色过亮；glass 性能；宏量色被误读为好坏；AI 高置信视觉降低检查意愿；对比度/焦点/色盲；Bottom Sheet 键盘遮挡。

验证：真实设备字体、WCAG 对比度、320/375/414px、系统字体 1.3–1.5x、低端设备降级、权限/识别失败/超时/部分字段、AI 与用户值区分、同步失败语义、深色图表色觉可用性。
