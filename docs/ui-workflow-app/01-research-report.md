# 参考素材分析报告

## 一、风格趋势总结

AI Food Diary 的 Android 体验应以「温暖、可信、低负担」为核心，使用 Material 3 的原生结构承载暖琥珀、陶土与橄榄色语义，而不是将 Web 的玻璃、渐变、视差或三栏布局缩小搬入手机。移动端重点不是视觉装饰，而是让用户能快速完成「输入 → AI 草稿 → 检查 → 储存」闭环。

当前仓库已有较完整的视觉基础与业务能力，但主要风险在于信息密度、长表单、AI 状态与移动任务形态之间尚未完全匹配。建议采用「今日工作台 + 快速记录 + 全屏 AI 审核 + 可恢复状态中心」的移动优先结构。

### 证据与来源口径

- **[仓库事实]** 依据 `docs/ui-design-system-shared.md`、`mobile/lib/theme/app_theme.dart`、`mobile/lib/screens/dashboard_screen.dart`、`mobile/lib/widgets/meal_capture_form.dart` 等文件。
- **[外部参考观察]** 仅使用本次任务提供的 Android 官方文档、Open Health Stack、Veri AI Meal Logging 与移动模式集合。
- **[设计推论]** 是针对本项目的建议，不代表仓库当前已实现。
- **[待确认]** 代表产品、隐私、平台版本或数据策略尚未冻结。

## 二、参考来源可用性

| 来源 | 可用性 | 本报告用途 | 限制 |
|---|---|---|---|
| `docs/ui-design-system-shared.md` | 可完整使用 | 品牌、IA、状态、文案、Token 基础 | 仍有部分产品决策待确认 |
| Android Navigation Bar 官方文档 | 高可信 | 底部导航结构与 Insets | 不提供本项目具体视觉方案 |
| Android Bottom Sheets 官方文档 | 高可信 | Sheet 使用边界与 dismiss 行为 | 不替代复杂流程设计 |
| Open Health Stack 离线同步指南 | 高可信 | 离线、同步、失败状态 | 偏健康应用原则，需转译到饮食记录 |
| Veri AI Meal Logging | 可参考 | 拍照与手动输入的行为取舍 | 个案研究，不能直接当作普遍数据 |
| Mobbin | 受限 | 用户旅程与模式检索方法 | 未登录，无法将不可见页面作为事实 |
| 60fps.design / UI Pocket | 中低 | 状态与交互模式索引 | 不作为平台规范或具体组件规格 |
| Awwwards / Godly / Supahero / Pinterest | 本轮不适用 | 仅用于说明应避免营销页迁移 | 不作为 Android 原生依据 |
| React Bits Magic Bento | 获取失败 | 未纳入设计依据 | JavaScript 渲染内容未成功读取 |
| 外部技能 | 未调用 | 使用 Android、Material 3、无障碍检查清单兜底 | 未发现或未安装 `platform-design-skills`、`mobile-app-ui-design`、`ux-audit` |

## 三、重点参考：最贴近当前项目的素材

### 参考 1：Android Navigation Bar 官方文档

- **来源**：https://developer.android.com/develop/ui/compose/components/navigation-bar
- **风格关键词**：Material 3、目的地导向、紧凑、稳定、原生
- **值得借鉴的地方**：3–5 个同等重要目的地适合紧凑手机窗口；本项目保留「飲食 / 健康 / 設定」三项合理；选中状态使用统一的 Material indicator 与品牌色，不使用营养数据色；保持轻量导航反馈并尊重系统 Insets。
- **不适合借鉴的地方**：不应为了放入「我的食物」而增加第四个 Tab；食物应继续作为记录流程与设置中的上下文入口。

### 参考 2：Google Open Health Stack 离线/同步指南

- **来源**：https://developers.google.com/open-health-stack/design/offline-sync-guideline
- **风格关键词**：离线优先、可恢复、状态透明、行动导向
- **值得借鉴的地方**：在饮食页或状态入口集中显示同步状态；离线不使用危险红色伪装成错误；同步进度尽量表达阶段或进度；提供「待同步」「同步失败」「立即同步」「重试」与最后时间。
- **不适合借鉴的地方**：不能把健康资料同步逻辑变成饮食记录前置条件；Health Connect 拒绝后仍必须能记录餐点。

### 参考 3：Veri AI Meal Logging

- **来源**：https://tonjrv.com/Work/MealLogging
- **风格关键词**：快速输入、相机辅助、可编辑 AI 结果、低摩擦
- **值得借鉴的地方**：拍照入口应明显，但「描述」和「手动记录」必须容易发现；拍照后要明确说明上传/分析状态；AI 结果必须进入可编辑审核，而不是直接成为正式纪录。该个案报告约 50% 餐点在 10 秒内完成，仍约 40% 用户选择传统文字记录，说明手动入口与隐私选择不能被隐藏。
- **不适合借鉴的地方**：个案比例不能直接作为本项目 KPI，仍需验证台湾用户、隐私敏感用户与进阶营养用户行为。

### 参考 4：Android Bottom Sheets 官方文档

- **来源**：https://developer.android.com/develop/ui/compose/components/bottom-sheets
- **风格关键词**：临时覆盖、短任务、明确关闭、层级清晰
- **值得借鉴的地方**：来源选择、短筛选、简单确认适合 Modal Bottom Sheet；使用 Material surface；提供拖曳把手、明确关闭行为、系统返回与点击外部关闭。
- **不适合借鉴的地方**：多项目 AI 审核、复杂营养编辑和长手动表单不应继续塞入 Sheet，应改为全屏页面。

### 参考 5：Mobbin、60fps.design、UI Pocket

- **来源**：https://mobbin.com、https://60fps.design、https://www.ui-pocket.com/mobile
- **风格关键词**：用户旅程、状态覆盖、组件模式、过渡设计
- **值得借鉴的地方**：按「新增餐点」「权限」「同步失败」「空状态」等完整旅程研究，而不是只看首页；重点关注 loading、progress、success、permission、sheet、dialog 的前后关系。
- **不适合借鉴的地方**：Mobbin 无法登录查看全部内容；这些网站的截图不能视为 Android 官方规范或本项目用户研究结论。

## 四、对现有 `mobile/` 的具体设计启示

### 现状优点

- **[仓库事实]** `mobile/lib/theme/app_theme.dart` 已使用 Material 3、三项 `NavigationBar`、深浅色主题、共享语义色、14px field 与 20px card 圆角。
- **[仓库事实]** `mobile/lib/main.dart` 已具备系统主题切换、SplashScreen 与 Sentry。
- **[仓库事实]** `DashboardScreen` 使用 `IndexedStack`，采用缓存优先启动，适合移动端保持 Tab 状态与快速进入。
- **[仓库事实]** `meal_capture_form.dart` 已支持拍照、描述、手动、最多五张图片、精準模式、我的食物、条码与营养标示。
- **[仓库事实]** AI 分析可由 WorkManager 在背景执行，切换 Tab 或离开 App 后仍能继续。
- **[仓库事实]** `.maestro/flows` 已覆盖三 Tab、手动记录与我的食物导航等基础路径。

### 主要摩擦点

- **[设计推论] 今日页过长**：当前顺序包含日期切换、热量卡、饮水、完整新增餐点表单、餐点列表与总结，P0 的「记录饮食」可能被大量摘要与表单内容推低。
- **[设计推论] 新增餐点同时承担过多任务**：条码、营养标示、品牌搜寻、我的食物与多项目手动编辑应渐进展开，不宜一次呈现。
- **[设计推论] AI 审核 Sheet 可能过于拥挤**：确认流程包含多项目编辑、重新估算与储存，较适合全屏审核页。
- **[仓库事实 / 设计风险] SnackBar 承担过多 AI 状态**：AI 完成或失败会显示 SnackBar，同时有分析 Banner。关键结果不应只依赖短暂 SnackBar，应有持续的待处理入口。
- **[设计风险] 当前 AI 评分文案存在负面语义**：`meal_capture_form.dart` 中包含「較推薦 / 普通 / 建議少吃」，与共享规范的非评判、非羞耻原则存在潜在冲突。
- **[设计推论] 健康页信息密度偏高**：三列 metric grid、多个健康分组、Activity rings、同步范围、同步记录与历史 Sheet，在小屏和大字模式下容易拥挤。
- **[设计风险] 我的食物的长按批量操作不够可发现**：长按应有明确的多选按钮或更多菜单替代。
- **[设计风险] 昨日总结自动 Dialog 可能打断首次使用**：需要「稍后查看」与再次召回，不应阻塞今日主任务。
- **[仓库事实]** `mobile/README.md` 仍是 Flutter starter 文档，不应作为产品行为或 IA 依据。

## 五、建议的移动模式

1. **今日工作台**：顶部日期与同步状态；第一层今日摘要与最近餐点；明确主行动 `记录饮食`；次级行动查看历史、今日总结、健康详情。
2. **快速记录**：Bottom Sheet 提供 `拍照记录`、`从相簿选取`、`描述餐點`、`手動记录`；系统相机、相簿、条码扫描使用原生页面。
3. **AI 草稿审核**：复杂审核使用全屏页，顶部显示 `AI 分析草稿`、`AI 估算・待确认`，每个项目可编辑，底部固定 `确认并储存` 并避让键盘与系统手势区。
4. **储存与恢复**：储存中禁用重复提交；失败保留相片、文字、草稿与用户修改；离线显示 `已保留在此装置，待同步`。
5. **健康同步**：状态集中展示，显示同步范围、最后时间与重试；Health Connect 权限不阻挡饮食记录。
6. **我的食物**：最近/常用优先，搜索和筛选渐进展开；批量操作不能只依赖长按。

## 六、移动状态处理建议

| 状态 | 移动端表现 |
|---|---|
| `idle / input` | 显示清晰输入入口与餐别 |
| `captured` | 显示已接收的相片、文字或手动项目 |
| `uploading / analyzing` | 页面内状态 Banner；允许离开并进入待处理入口 |
| `review` | 全屏审核页，明确 AI 草稿边界 |
| `review-unsaved` | 返回或离开时提示未储存修改 |
| `saving` | 固定 CTA 显示储存中，禁止重复提交 |
| `saved` | 页面内确认，SnackBar 只作补充 |
| `offline` | 中性离线提示，不显示为错误 |
| `pending-sync` | 显示本机保留、待同步与重试入口 |
| `error` | 说明资料是否保留，并提供重试或手动替代 |
| `permission-required` | 说明相机、相簿、通知或 Health Connect 用途 |
| `permission-denied` | 提供前往系统设置与稍后处理 |
| `syncing / sync-failed` | 显示同步范围、最后时间、重试 |
| `empty` | 说明暂无资料，并提供唯一主 CTA |
| `conflict` | 显示两个版本差异，不静默覆盖 |

## 七、给下游专家的建议

- **Form**：将新增餐点拆成短任务与全屏审核；手动输入支持键盘顺序、自动滚动、单位说明与错误定位；保持拍照与手动同等可见。
- **Visual**：沿用 `mobile/lib/theme/app_theme.dart` 与共享规范的 Material 3、暖琥珀、陶土、橄榄语义；避免玻璃、3D、持续视差。
- **IA**：坚持三项底部导航；食物不独立成 Tab；把今日工作台、状态中心、待处理草稿作为移动核心。
- **Interaction**：短任务使用 Sheet，复杂 AI 审核使用全屏页；所有滑动、长按、下拉都有可见按钮替代；照顾单手与系统返回。
- **Content**：使用台湾繁体中文与统一词汇；移除羞耻、诊断和过度确定语气。
- **Accessibility**：验证 TalkBack、48px 触控目标、动态字体、对比度、键盘避让、安全区与非颜色状态表达。

## 八、假设、风险与待确认

### 假设

- Android 继续使用「飲食 / 健康 / 設定」三项底部导航。
- AI 不会在用户确认前自动写入正式饮食纪录。
- 拍照、描述、手动三种输入都属于 P0。
- 共享设计 Token 是 Android 与 Web 的权威基础，移动端只做平台化转译。

### 风险

- AI 评分或红绿颜色过强，可能制造健康焦虑或误导用户。
- 当前长表单、三列健康指标与嵌套 Sheet 可能在小屏、大字、软键盘下溢出。
- 背景 AI 分析若只依赖通知或 SnackBar，用户可能错过待审核结果。
- 离线保存、重复提交、多设备冲突的正式语义尚未完全确认。
- 相片、体重、饮食与 Health Connect 属于敏感资料，权限、保存期限与删除机制需明确。
- 当前 `.maestro/flows` 尚未证明离线、权限、TalkBack、动态字体与恢复流程可用。

### 需要产品确认的问题

1. Android 最低版本、目标设备尺寸与是否必须支持三键导航模式？
2. 是否允许离线建立并确认餐点？草稿保存多久？
3. 「本机保留」「账号已储存」「已同步」的正式定义是什么？
4. AI 信心度是否显示？营养值能否直接编辑？
5. 是否保留「較推薦 / 普通 / 建議少吃」这类评分，或改为中性描述？
6. 相片是否上传第三方 AI 服务？保存、删除与导出规则是什么？
7. Health Connect 读取哪些资料、同步频率与历史回填范围为何？
8. 背景分析完成是否默认发送通知？通知权限被拒绝后如何提醒？
9. 昨日总结是否继续自动弹出，还是改为今日页内可召回卡片？
10. 「我的食物」的封存、删除与历史餐点之间如何关联？

## 九、外部工具与技能说明

- 用户选择了 TinyFish 搜索，但当前环境没有 TinyFish MCP 工具（工具搜索无匹配）；因此使用等效的 Web 搜索与 `fetch_content`。
- 已使用：项目内 `ui-workflow` 协议、Android 官方文档、Google Open Health Stack 设计指南、Veri 案例与移动模式站点。
- 未调用：`ehmo/platform-design-skills`、`ceorkm/mobile-app-ui-design`、`ux-audit`、`copywriting` 等第三方技能；以内建 Android/Material 3、移动端与无障碍质量清单兜底。
