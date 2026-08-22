# 参考素材分析报告

本报告仅研究 **AI Food Diary 的 Web application**，目标为桌面优先、高信息密度、响应式的 Web 工作台，覆盖平板与移动 Web 适配。本轮不设计原生 App，也不修改任何生产代码。

- **[参考事实]**：直接来自已抓取或检视的外部素材。
- **[产品事实]**：来自仓库现状与 `docs/ui-design-system-shared.md`。
- **[设计推断]**：基于事实提出的适用建议。
- **[待确认假设]**：需要通过用户研究、产品决策或技术验证确认。

TinyFish/MCP 在当前环境不可用，本报告使用等效 Web 搜索与 readable fetch 作为替代。动态渲染失败的来源已明确标注，不作为主要依据。

## References Inspected（参考素材检视）

| 来源 | 相关性 | 关键观察 |
|---|---|---|
| `docs/ui-design-system-shared.md` | 极高 | 已定义桌面左侧持久导航、主工作区、可选辅助面板；暖色 token、4/8 间距、48px 交互目标、AI 草稿审阅模型、离线/同步/冲突状态与台湾繁中原则。 |
| `src/app/dashboard/layout.tsx` | 极高 | 当前包含 auth guard、品牌 header，以及 `max-w-3xl` 窄内容容器；适合聚焦内容，不足以承载桌面高密度工作台。 |
| `src/components/dashboard-nav.tsx` | 极高 | 当前为四项「飲食 / 健康 / 食物 / 設定」玻璃胶囊顶栏，active 项使用 amber 填充；领域分组清晰，但桌面持续可见性有限。 |
| `src/app/dashboard/page.tsx`、`src/components/meal-capture-form.tsx`、`MealList` | 极高 | 今日/周视图、日期切换、热量与 macro、饮水、餐点列表、周营养 review、每日总结，以及照片/描述/手动记录、AI 分析、草稿确认、编辑、错误恢复等复杂流程均已存在。 |
| `src/app/dashboard/health/page.tsx` | 极高 | 包含 Health Connect 同步说明、活动 hero、健康分组卡、睡眠图、体重 sparkline、BMR/TDEE；信息类型横跨同步状态、趋势与健康指标。 |
| `src/app/dashboard/foods/page.tsx`、`src/components/saved-foods-manager.tsx` | 极高 | 我的食物支持搜索、收藏、条码、批量封存/还原、冲突处理，适合发展为桌面高密度管理视图。 |
| `src/app/dashboard/settings/page.tsx` | 高 | 包含使用者设定、AI 设置、我的食物入口、Google 绑定、管理员设置、版本信息与登出；需要分组和明确保存状态。 |
| `src/app/globals.css`、`README.md` | 高 | 当前使用暖米色背景、环境光 blobs、`.glass`/`.glass-dark`、iridescent 动边框和 hover lift；README 强调 AI Vision、每日总结、健康同步、隐私与加密。 |
| [Godly Website](https://godly.website) | 中 | 内容实际显示为 Recent Design Inspiration 首页，提供 Websites、App screenshots、Tools、Skills 等分类；适合作为视觉筛选来源。 |
| [Awwwards](https://www.awwwards.com) | 中 | 主要围绕网站奖项、站点目录、collections 与 blog，强调趋势、渐变、沉浸式表现和营销页面节奏。 |
| [Mobbin](https://mobbin.com) | 高 | 以完整 flows 展示 Home、Settings、Login、Account Setup、Profile，以及 Sidebar、Bottom Sheet、Toast、Dialog、Tab、Progress Indicator 等模式；重点是完整用户旅程。 |
| [React Bits Magic Bento](https://reactbits.dev/components/magic-bento) | 低 | 动态渲染无法抓取，本轮不作为视觉或交互依据。 |
| [Supahero](https://supahero.io) | 中 | 提供 hero section 素材，包括 MyHealthPrac、More Nutrition、Daisy AI、Linear、Basedash 等；适合寻找品牌视觉方向，不适合直接规范应用工作台。 |
| [60fps.design](https://60fps.design) | 中高 | 按 Filter、AI、Bottom Sheet、Calendar、Card、Delete、Empty State、Graph、Goal、Loading 等交互意图分类；适合借鉴动效目的与反馈节奏。 |
| [UI Pocket Mobile](https://www.ui-pocket.com/mobile) | 低至中 | 以应用屏幕展示 tabiori、Spotify、Nintendo Store、Speak 等移动界面；本轮不用于决定 Web 布局。 |
| Pinterest UI inspiration | 低 | 动态渲染失败，未作为依据。 |
| 等效 Web 搜索结果 | 高 | AI/营养追踪产品常见持久侧栏、今日总览、快速动作、每日/周 review；表格适合比较、排序、筛选与批量操作；表单和 AI 审核应在提交前允许 review、修正与错误恢复。 |

## External Skills Consulted（外部技能检视）

| 技能或来源 | 状态 | 用途与限制 |
|---|---|---|
| `ui-workflow` | 可用，已检查相关外部来源 | 确认研究流程、参考素材分类与 Web UI/UX checklist。 |
| `@sentiolabs/pi-frontend-design` | 可用，已读取 | 用于反 AI-slop 的视觉判断：避免模板化渐变、无意义玻璃效果和装饰性组件；本轮不直接写生产代码。 |
| `design-dna` | 可用，本轮未正式采用 | 适合从截图或视觉参考提取完整 Design DNA；本轮素材以文字抓取结果和仓库事实为主。 |
| `web-perf` | 可用，本轮未执行 | 适合后续测量 LCP、INP、CLS；本轮未启动浏览器性能分析。 |
| `vercel-labs/web-design-guidelines` | 不可用 | 使用内建 Web 可用性与响应式 checklist 兜底。 |
| `addyosmani/accessibility` | 不可用 | 使用 WCAG、语义 HTML、键盘与焦点管理原则兜底。 |
| `web-quality-audit`、`ui-audit`、`ux-audit`、`copywriting` | 不可用 | 使用已检索的表单、状态、无障碍与非评判式文案结论兜底。 |

## Patterns Worth Borrowing

### 1. 桌面工作台壳层

推荐采用：

```text
持久侧栏        主工作区                         可选辅助面板
领域导航        今日摘要 / 记录 / 表格 / 图表       待确认、同步、上下文详情
状态中心
```

侧栏固定展示「飲食、健康、食物、設定」，底部或顶部提供同步/异常/待确认入口；主工作区负责主要任务；辅助面板只显示当前任务相关内容。

### 2. 摘要优先、详情渐进展开

今日页建议按「日期/视图与新增 → 热量/macro/饮水摘要 → 待确认草稿和异常 → 餐点时间线 → 周趋势与总结」组织。每个摘要卡只承担一个主要判断，避免所有营养字段同时展开。

### 3. 卡片与表格配合

卡片用于热量、macro、饮水、趋势摘要和状态；表格用于历史记录、我的食物、批量封存、排序、筛选与跨日比较；详情抽屉用于单笔餐点、AI 推断依据、修改历史和冲突详情。

### 4. AI 草稿审阅流程

```text
输入 → AI 分析中 → AI 草稿待确认 → 用户编辑 → 确认储存 → 已储存 / 待同步 / 保存失败
```

AI 结果必须标记为「估算/待确认」，食物、份量、营养值均可编辑；重新辨识不能无声覆盖用户修改；保存失败保留原始输入和修改。

### 5. 可操作的筛选和批量管理

历史饮食和我的食物使用可移除筛选 chips、结果数量和 Clear all；批量操作显示影响范围；危险操作用确认 Dialog 说明是否可还原；桌面表格使用 sticky header，必要时固定关键首列；提供 compact/regular/relaxed 三档密度；移动 Web 只保留优先列，详情进入抽屉/详情页。

### 6. 完整状态设计

每个页面/局部面板定义首次无资料、筛选无结果、加载中、AI 分析中、同步中、待同步、冲突、局部失败、保存成功、保存失败、离线等状态。错误解释发生什么及下一步；局部 panel 失败不应打垮整个 Dashboard。

### 7. 语义表格与渐进增强

历史记录和我的食物管理优先使用语义 `table`、`thead`、`tbody` 与正确的 `th scope`。只有确实需要复杂键盘导航、单元格编辑或虚拟化时，才评估复杂 grid 行为。

### 8. 键盘、焦点与可访问性

沿用共享设计系统：`Ctrl/Cmd+K` 搜索、`N` 新增（输入框聚焦时不触发）、`Esc` 关闭/处理未保存；Dialog/Drawer 打开时焦点进入、关闭后返回触发元素；重要状态用 polite live region；所有控件至少 48px；图表提供文字摘要或表格替代；颜色不是唯一状态传达方式。

## Patterns to Avoid

- 把 Awwwards/Supahero 的营销页面满屏渐变、3D、粒子、shader、强滚动叙事直接搬入工作台。
- 全域玻璃拟态：玻璃仅用于导航、辅助面板和轻浮层，不用于密集营养表格、AI 表单和错误状态。
- 全站继续使用窄 `max-w-3xl`：窄容器可保留在文本详情/设置表单，但不应限制历史比较、批量管理和双栏审核。
- 用卡片堆叠制造“高信息密度”：避免重复数据、过多大卡片和缺乏对齐。
- AI 自动做最终判断、自动覆盖修改、保存失败清空输入或用健康评分制造羞耻感。
- 只设计成功路径，忽略识别失败、网络中断、同步失败、多端冲突和离开未保存。
- 过早使用复杂 ARIA grid、依赖 hover、使用过小文字或把关键错误只放 Toast。

## Product-Specific Design Implications

| 产品区域 | 当前事实 | Web 设计推断 | 待确认事项 |
|---|---|---|---|
| 全域壳层 | `layout.tsx` 有 auth guard、品牌 header、`max-w-3xl`。 | 保留认证与品牌入口；桌面改为持久侧栏 + 宽主工作区；窄容器只用于详情/表单。 | 桌面最小宽度、侧栏收起、多窗口需求。 |
| 全域导航 | `dashboard-nav.tsx` 为四项玻璃胶囊顶栏。 | 四个领域命名保留；桌面转为侧栏，顶栏保留品牌、搜索、用户、状态入口。 | 待确认/同步异常数量是否显示。 |
| 今日饮食 | 有日/周视图、热量卡、macro donut、净热量、饮水、餐点列表、周 review、每日总结。 | 顶部呈现摘要；中段突出待确认草稿和餐点时间线；周 review/每日总结放辅助区或折叠区。 | 默认 KPI、净热量是否首屏。 |
| 餐点记录 | 支持照片、描述、手动、多图片、精确模式、营养标示、条码、品牌、我的食物、AI 分析与确认。 | 采用 capture → review → save 状态；首次输入隐藏高级选项；保存失败保留上下文。 | 等待时间、重新辨识覆盖规则、离线草稿。 |
| 健康趋势 | 有同步说明、活动 hero、健康分组卡、睡眠图、体重 sparkline、BMR/TDEE。 | 先展示来源、更新时间和异常，再展示趋势；图表旁提供文字摘要。 | Web 可用数据、缺失规则、指标说明。 |
| 我的食物 | 支持搜索、收藏、条码、批量封存/还原和冲突处理。 | 桌面使用高密度语义表格；工具栏固定搜索/筛选/批量操作；冲突独立展示。 | 数据量级、分页/虚拟化、可撤销性。 |
| 设置 | 有使用者、AI、我的食物、Google、管理员、版本、登出。 | 按任务分区；每区独立保存状态；危险操作与一般设置分开。 | 权限、自动保存与错误恢复。 |
| 视觉系统 | 暖米色、环境光、玻璃、iridescent、hover lift。 | 保留暖色和少量环境光；核心数据使用实色表面；动边框限制使用。 | 深色主题跟随系统还是手动。 |
| 隐私与信任 | README 强调 AI Vision、健康同步、隐私与加密。 | 上传照片、AI 分析、健康同步和保存状态都要有明确说明。 | AI 数据政策、照片保留、同步失败的本地策略。 |

## Recommended Direction

> **一个暖色、可信、可编辑、非评判式的 AI 饮食与健康记录 Web 工作台。**

它不是单纯图表墙，也不是聊天界面；核心价值是让用户快速完成「记录饮食 → 检查 AI 草稿 → 修正 → 确认保存 → 查看趋势并行动」。

### 推荐信息架构

```text
侧栏
├── 飲食
│   ├── 今日
│   ├── 历史
│   └── 待确认
├── 健康
│   ├── 总览
│   └── 趋势
├── 食物
└── 設定

状态中心
├── 待确认
├── 待同步
├── 冲突
└── 失败项目
```

### 桌面与响应式方向

- 宽桌面：左侧持久导航、中央主工作区、右侧可选辅助面板，32px Web gutter；大表格 sticky header，必要时固定关键列。
- 一般桌面/平板：侧栏折叠为 rail 或抽屉，辅助面板改 Drawer，空间不足时单栏优先。
- 移动 Web：单栏、可访问菜单/抽屉、复杂详情/筛选/批量操作进入 Drawer 或独立详情，不强行压缩桌面表格。

### 主题与动效方向

- 明亮主题沿用 `#B45309` amber、`#FDF6EC` canvas、`#FFFFFF` surface、`#292320` primary content 等共享 token。
- 深色主题采用暖炭方向，所有正文、边框、图表和状态色需重新做 WCAG 对比度验证。
- 只使用短暂淡入、分析进度、保存确认、图表切换、Drawer/Dialog 过渡；支持 `prefers-reduced-motion`，不使用持续视差、3D、粒子或重度动态边框。

### 研究限制、假设与下一步

- TinyFish/MCP、React Bits Magic Bento、Pinterest 因当前环境/动态渲染不可用；已用等效 Web 搜索和可读抓取兜底。
- 未做真实用户访谈、浏览器截图对照、可用性测试、无障碍审计或性能基线；深色 token 仍需实际界面验证。
- 下一步先产出权威需求报告，再严格按深度模式执行形态 → 视觉 → IA → 交互 → 内容；优先验证桌面侧栏、今日工作区、AI review、历史表格和状态中心。
