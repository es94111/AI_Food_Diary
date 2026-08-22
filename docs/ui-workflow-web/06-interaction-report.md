# 06-interaction-report.md

> **范围**：仅 Next.js Web application，覆盖桌面 Web、平板 Web、移动 Web；不设计 Android/Flutter/原生 Mobile App，不修改生产代码。
> **交互协议等级**：必须=验收不可缺；应该=默认实现；可以=增强项。
> **核心不变量**：AI 完成≠储存；本机≠账号≠同步；筛选空≠无资料；无健康资料≠拒绝授权；保存失败不清空；冲突不覆盖；Health Connect 拒绝不阻塞饮食；颜色/图表/图示/动效不作为唯一状态表达。

## 1. Interaction Principles

1. **状态诚实优先**：`AI 估算・待确认`、`已储存`、`离线保留`、`待同步`、`同步失败`、`发生冲突` 使用不同文字、结构和操作；不能用“完成”统称。
2. **先摘要，后详情**：今日/历史/健康先显示日期、摘要、状态、主 CTA；食物细项、来源、计算、编辑历史进 Drawer/展开/详情页。
3. **关键操作可恢复**：保存失败不关闭 Review；网络中断保留输入；删除/封存/重分析/冲突说明影响；dirty 离开先确认；Drawer 关闭恢复来源筛选/排序/日期/滚动。
4. **一次只突出一个主要动作**：新增用 `开始分析`/`继续确认`，Review 用 `确认并储存`，保存失败用 `重试储存`，状态项目突出一个恢复 CTA。
5. **非医疗、非羞辱**：不使用“吃错、不及格、超标失败”；用“目前记录、与目标的差距、资料尚不完整”。danger 只用于真实错误、删除、不可恢复。
6. **URL 是可恢复状态**：日期/日周、搜索/筛选/排序、详情对象、草稿/Review 都可通过 URL 恢复；不放原始图片、完整错误堆栈或凭证。
7. **Web 交互优先**：hover 只增强桌面；移动 Web 不依赖滑动删除、长按、双指、拖曳等隐藏手势；所有核心动作有可见按钮；目标至少 48×48px。

## 2. Component State Matrix

| 组件/区域 | Default | Hover | Focus | Active/Pressed | Selected | Disabled | Loading | Success | Error | Offline | Conflict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| App Shell/侧栏 | 资料可浏览 | surface 轻变 | 3px ring | 当前领域 active | active indicator+文字 | 说明无权限 | 主区局部加载，Shell 可用 | 状态入口更新 | 局部错误不打垮 Shell | 持久离线 banner | 状态中心入口 |
| 主 CTA | 可操作 | brand.hover | ring | pressed 80–120ms | toggle/filter selected | 说明缺少条件 | 保留文字+spinner | `已储存` | `重试储存` | `已保留・待同步` | `查看差异` |
| Input/AI field | label/单位/值 | 边框增强 | ring | 编辑中 | 选项高亮 | 说明原因 | 保留值+保存中 | 值已写入 | inline error+摘要 | 本机修改 | 双版本差异 |
| Capture | 三种方式可选 | 区域高亮 | mode/button 可聚焦 | 当前 mode | 当前 mode selected | 超限动作禁用 | 每文件状态 | `已接收` | 文件/AI错误 | 草稿保留 | 进入冲突 |
| AI Draft | `AI 估算・待确认` | 字段提示 | 字段 ring | Review active | 用户修改标记 | 解释不可编辑 | skeleton+阶段文案 | 不等于储存 | 保留+重试 | 本机草稿 | 差异选择 |
| 保存操作栏 | 保留/取消/确认 | 增强 | Tab 顺序 | 工作区 active | 主动作 | 验证前禁用 | `正在储存…` | 更新状态中心 | `重试储存` | `等待同步` | 停止覆盖 |
| 餐点列表 | 摘要/时间/状态 | 行背景 | 行内动作 ring | 行/动作按下 | 当前餐点 | 不可编辑原因 | 局部 skeleton | 新记录插入 | 单项重试 | 离线状态 | 版本详情 |
| Filter Bar | 搜索/筛选/排序/数量 | 控件增强 | 各项可聚焦 | chip pressed | 背景+移除 | 无条件时清除禁用 | 结果局部载入 | 数量更新 | 查询失败 | 保留旧结果 | 不适用 |
| 语义 Table | 表头/行/操作 | 行高亮 | 元素 ring | 复选/按钮 pressed | 行+checkbox | 行原因 | skeleton rows | 批量结果 | 局部重试 | 缓存时间 | 冲突行 |
| Status item | 对象/状态/时间/CTA | 背景变 | CTA ring | CTA pressed | 筛选 selected | 完成动作禁用 | 处理中 | 移已完成 | 重试保留 | 本机任务 | 查看差异 |
| Health module | 来源/时间/指标 | 查看提示 | 图表/链接 ring | 日期/同步 pressed | 指标 selected | 未连接说明 | skeleton/sync | `已更新` | 局部失败 | 饮食可用 | 版本处理 |
| Chart | 标题/图例/摘要 | 数据点提示 | 数据点/表格替代 | 点 pressed | 日期/系列 selected | 表格替代 | skeleton | 摘要更新 | 局部重试 | 最后更新时间 | 通常不适用 |
| Drawer/Dialog | 标题/内容/动作 | 内部控件增强 | 焦点锁定 | 动作 pressed | 选项 selected | 解释原因 | 内容 skeleton | 动作完成 | inline error | 显示限制 | 不静默关闭 |

### 状态生命周期

| 状态 | 必须显示 | 用户动作 | 退出 |
|---|---|---|---|
| `idle` | 空白工作区/开始入口 | 开始记录/载入 | 输入/请求 |
| `input` | 当前值/辅助说明 | 修改/取消/保存草稿 | 提交/离开 |
| `captured` | 输入摘要/预览 | 检查/删除/分析 | 上传/手动 |
| `uploading` | 每文件状态/取消 | 等待/取消 | 完成/失败 |
| `analyzing` | 阶段文字/静态 skeleton | 等待/手动替代 | review/error |
| `review` | `AI 估算・待确认` | 修改/重分析/确认 | saving/离开 |
| `review-unsaved` | `已由你修改`/未储存 | 保存/保留/离开确认 | saving/cancel |
| `saving` | `正在储存…`/禁重复 | 等待 | saved/error/pending-sync/conflict |
| `saved` | `已储存`/详情入口 | 查看/编辑/重复 | 下一操作 |
| `offline` | 离线 banner/最近更新时间 | 编辑/本机保留 | 恢复/重试 |
| `pending-sync` | 本机保留/等待同步 | 状态/重试 | syncing/saved/sync-failed/conflict |
| `error` | 原因/资料保留/下一步 | 重试/手动/返回 | 成功/取消 |
| `permission-required` | 用途/非阻塞说明 | 连接/跳过 | granted/denied |
| `permission-denied` | 拒绝/替代路径 | 重连/继续饮食 | 重授权/跳过 |
| `syncing` | 对象/阶段 | 等待/离开 | saved/fail/conflict |
| `sync-failed` | 范围/重试 | 单项/全部重试 | syncing/saved/conflict |
| `empty` | 原因/CTA | 创建/导入 | 建立资料 |
| `conflict` | 两版本/时间/来源 | 保留本机/账号/另存 | 明确选择 |

## 3. Loading / Empty / Error / Success / Sync

### 持久反馈规则

- AI 完成：页面持久显示 `AI 估算・待确认`，可编辑/确认。
- 字段错误：字段文字错误 + 顶部摘要 + 聚焦首错。
- 保存成功：页面显示 `已储存`，状态中心同步更新；Toast 只作补充。
- 保存失败：inline + 状态中心，显示 `保存失败，草稿仍保留` 和 `重试储存`。
- 断网：持久 banner + 最后更新时间；不称为服务器成功。
- 待同步/同步失败/冲突：状态中心持久列出对象、日期、更新时间、状态、CTA。
- 权限拒绝：健康区说明拒绝不影响饮食。

### 页面状态要点

- **登录/注册**：表单提交保留值；失败有摘要和字段错误；网络失败可重试；成功焦点进入 Dashboard 标题。
- **今日**：骨架保留日期/标题；空状态 `今天还没有餐点记录` + `记录饮食`；局部失败不影响新增；无健康数据不伪造净热量。
- **Capture**：照片/描述/手动切换不丢输入；拖放有按钮替代；最多 5 张/单张 6MB 验证具体到文件；每文件独立上传状态；AI 失败可手动。
- **Review**：空 AI 结果允许手动新增；用户修改标记；重分析前说明覆盖范围；保存失败不关闭；离开 dirty 先确认。
- **餐点详情**：桌面 Drawer/移动完整页；图片缺失仍显示资料；删除/重复需明确影响。
- **历史**：图表与表格共享筛选；缺失日为 `无记录` 不补零；筛选无结果与全局空分开；图表失败仍有文字/表格。
- **健康**：未连接、已连接无资料、过期、拒绝、同步失败、部分同步分开；饮食仍可用。
- **食物**：表头与骨架行固定；首次无资料有新增/从餐点储存；搜索/筛选无结果带关键词和清除；批次部分失败显示成功/失败范围。
- **状态中心**：分组「需要你处理/处理中/稍后重试/已完成」；空状态返回今日；局部载入和错误不阻塞业务。
- **设置**：分组导航保持；字段错误、dirty、保存中/成功/失败清晰；权限不足只影响管理员分区。

## 4. Motion System

| 场景 | 时长 | Easing | 触发/目的 |
|---|---:|---|---|
| Hover/Focus | 100–160ms | `cubic-bezier(0.4,0,0.2,1)` | 指针/焦点辅助，不制造等待 |
| Pressed | 80–120ms | standard | 确认输入接收 |
| Chip/状态 | 120–200ms | standard | 选择与结果变化 |
| 局部进入 | 180–260ms | entrance `cubic-bezier(0,0,0.2,1)` | 建立层级 |
| Dialog | 180–220ms | entrance/exit | 说明焦点转换 |
| Drawer | 220–320ms | entrance/exit | 建立空间关系 |
| 图表/进度 | 240–400ms | standard | 比较数据变化，不自动播放 |

禁止 3D、粒子、shader、视差、鼠标追踪、彩虹边框、持续动画、失败抖动、用动效表示 AI 可靠度。`prefers-reduced-motion` 时关闭位移/缩放/抖动/循环/自动播放，Drawer/Dialog 可直接切换或短淡入，图表直接更新，分析保留静态 skeleton 和文字。

## 5. Keyboard Contract

### 通用

- Tab 顺序遵循视觉/任务顺序；不使用正数 `tabindex`。
- Enter 触发按钮/链接/选项；Space 触发按钮/checkbox/switch；输入框内不产生意外提交。
- 输入框、textarea、select、combobox、编辑器聚焦时不触发全局快捷键。
- Esc 从最内层关闭；dirty 先进入确认；所有快捷键都有可见鼠标/触控替代。

| 快捷键 | 功能 | 条件 |
|---|---|---|
| `Tab`/`Shift+Tab` | 前后移动 | 全站；Drawer/Dialog 内循环 |
| `Enter` | 触发当前控件 | 可提交控件 |
| `Space` | 切换 checkbox/switch/option | 可切换控件 |
| `Esc` | 关闭 Popover/Drawer/Dialog | 输入文字编辑时不误触发；dirty 先确认 |
| `Ctrl/Cmd+K` | 全域搜索 | 非输入/编辑/Modal 场景；焦点入搜索框 |
| `N` | 新增餐点 | 非输入/编辑、无浮层 |
| `Ctrl/Cmd+S` | 保存当前 dirty 草稿/设置 | 只拦截有保存能力的页面 |
| Arrow/Home/End | 菜单、Listbox、日期选项 | 不把普通 table 强制变成 grid |

Shell Tab 顺序：跳过链接→Logo/回今日→主导航→新增 CTA→Topbar→页面标题/主 CTA→日期/筛选→主资料→辅助区。导航抽屉打开后焦点进标题/第一项，关闭回按钮。

Capture/Review：返回→标题/状态→记录方式→餐期→原始输入→文件/食物项目→AI 状态→编辑字段→错误摘要→固定操作栏。`Ctrl/Cmd+S` 仅 dirty 时拦截。

### Table / Filter / Drawer / Dialog

- 语义表格默认 Tab 进入 checkbox、链接、按钮；不把整张表伪装 ARIA grid。排序按钮朗读字段和方向；选中朗读数量。
- Filter Popover 打开焦点进入标题/搜索/首项；Enter 应用，取消恢复打开前条件；Esc 关闭回筛选按钮；结果数量以 `aria-live=polite` 更新。
- Drawer/Dialog 打开前记录触发元素；打开焦点入标题/关闭/首项；Tab 循环；Esc 关闭；dirty 先确认；关闭回触发元素；路由刷新焦点入标题或 main。

## 6. Pointer / Touch（Web）

### 桌面指针

Hover 只改变表面/边框；单击统一触发；餐点摘要开详情，行内按钮阻止冒泡；文件拖放必须有选择按钮；主滚动优先；表格 sticky header/操作栏不能遮挡；遮罩关闭 dirty 先确认；不定义右键业务。

### 平板/移动 Web

- 所有目标至少 48×48px，相邻 8px；不依赖 hover、滑动删除、长按、双指、旋转或拖曳完成核心任务。
- 页面主滚动优先；必要表格横向查看保留首列/优先字段和详情入口；不能隐藏保存/返回/主 CTA。
- 新增/Review 底部固定操作栏含 `取消/保留草稿` + 主动作，内容底部预留空间；固定栏不遮挡键盘/错误。
- 虚拟键盘开启时聚焦字段自动滚入可见区域，操作栏在可视区上方；关闭后恢复滚动。
- 移动详情用全页/全屏层，必须有返回；浏览器返回恢复原列表上下文。
- 这是 Web 触控规范，不是原生 App 手势设计。

## 7. Form / AI Review Protocol

### Capture

- 三种模式切换不得丢输入；拖放有选择按钮；限制在选择前说明；每文件状态独立；AI 失败保留输入，提供重试/描述/手动。

### Validation

- label、单位、必填、范围、`aria-describedby`；blur 后或提交时验证，不在初次载入时铺红；提交显示所有错误；错误摘要可链接字段，首错获焦点；保留有效字段。

### AI fields

- AI 预填 `AI 估算` + brand.soft；用户改动显示 `已由你修改`，不是错误；Review 始终是草稿。重分析前说明覆盖范围；默认不覆盖已修改字段；建议提供旧/新对比、逐项套用未修改字段；保存失败保留全部。

### Save / duplicate / dirty

- `saving` 锁定按钮、快捷键和重复请求；成功后更新今日/历史/状态中心；失败回到可编辑 Review；重试用同一草稿上下文；离开 dirty 提供继续编辑/保留草稿/放弃；重复记录说明会建立新餐点，不改原件。服务端仍需幂等语义（本报告不实现）。

## 8. Table / Bulk / Filter Protocol

- 真实 `table/thead/tbody/th scope`；桌面 sticky header/必要首列；移动优先名称、日期/时间、关键营养、状态、主要动作；其余详情。
- 行操作直接可见；整行详情点击与行内按钮区分；排序显示字段和方向；选择显示行、checkbox、数量和批量栏；批量只作用当前筛选中明确选取对象。
- 过滤不同类别 AND、同类 OR；chips + count + clear all；结果更新时旧结果保留到新结果就绪；游标失效提示重载不静默变条件；分页/载入更多保留筛选/排序。
- `empty`、`filter-empty`、`error` 三种状态独立；查询错误不伪装空表。

## 9. Accessibility

### WCAG/语义

- 正文/背景 ≥4.5:1，大字 ≥3:1；标题、landmark、真实链接、label、单位、帮助、`header/nav/main/aside`；状态不只靠颜色/图标。
- 表单错误用 `aria-invalid`、`aria-describedby`；顶部错误摘要链接字段；保存/删除/冲突不只 Toast。
- 图表提供标题、时间范围、系列、单位、当前/范围/平均/目标、趋势文字与可展开语义表；tooltip 不作为唯一数值入口。

### aria-live

| 内容 | 公告 |
|---|---|
| 筛选结果 | polite：`目前有 12 笔我的食物资料` |
| AI 完成 | polite：`AI 分析完成，草稿尚未储存，请检查后确认` |
| 保存成功 | polite：`午餐已储存至账号` |
| 离线 | 持久 banner/必要时 assertive：`目前离线，草稿已保留在本机，尚未同步` |
| 保存失败/冲突 | assertive：说明保留与下一步 |
| 局部载入 | polite：`历史表格正在载入` |
| 权限拒绝 | polite：`健康资料连接未授权，饮食记录仍可继续` |

同一状态不因 re-render 重复朗读；`aria-busy` 只标记被替换区域；避免 spinner 无名称和重复错误朗读。

### 其他门槛

- P0 全键盘；200% 无功能损失；400%/窄屏不要求核心表单双向滚动；文字 1.3–1.5 倍不截断；固定栏不遮挡焦点；触控 48px；reduced motion；高对比度模式；敏感资料/凭证不在公告、日志和状态中心泄露。

## 10. Performance-sensitive UI Notes

- 内容区用 skeleton，离散按钮用 spinner；已载入区域不因另一区域失败而清空。
- 为图片预留比例、表格骨架稳定列宽、固定栏预留底部、图表先给结构，避免 Layout Shift。
- Glass 只用于侧栏/辅助/轻浮层，提供不透明 fallback；密集表格和表单不要 blur。
- 历史/食物/状态优先游标或载入更多；未有基线前不强制复杂虚拟列表。
- 图表按需载入、不可自动播放；筛选/排序/选择不阻塞输入；上传尽早验证，避免重复解码大图。
- AI 长任务不使用全屏无限 spinner；阶段文字和可恢复动作优先。

## 11. Test Scripts / Acceptance Checklist

### 测试脚本

1. **首次记录**：登录→今日空状态→记录饮食→描述/照片/手动→Review→确认储存；验证焦点入标题、主 CTA、AI 与储存区分。
2. **上传失败**：无效/超限文件 + 多张部分失败；验证具体错误、其余文件保留、可手动继续。
3. **重分析**：修改名称/份量→重新分析；验证覆盖说明、新旧比较、用户修改默认保留。
4. **保存失败/重复提交**：快速点击+Ctrl/Cmd+S→模拟网络失败→重试；验证不重复、全部输入保留。
5. **离线**：断网保存→刷新/返回→恢复网络；验证本机/账号/同步文案、无无限重试、状态中心。
6. **冲突**：本机/账号版本不同；验证差异、保留/采用/另存、不静默覆盖。
7. **历史/食物表格**：筛选→0结果→清除→排序→打开/关闭详情；验证 chips/count/URL/上下文恢复。
8. **健康拒绝**：未连接/拒绝→回饮食记录；验证健康状态区分、饮食不阻塞、不伪造净热量。
9. **键盘**：键盘登录、Tab 到新增、N、新增输入中 N 不触发、Ctrl/Cmd+K、Drawer/Dialog、Esc；验证焦点进/循环/回焦。
10. **移动虚拟键盘**：360/768 打开导航、聚焦底部字段、键盘、提交；验证无横溢、字段和固定栏可见。
11. **无障碍/主题**：屏幕阅读器保存失败、reduced motion、Light/Dark、200/400% 缩放、高对比度；验证公告、焦点、对比度和状态。

### 验收清单

- [ ] P0 可完成登录/新增/AI或手动/修正/确认储存；AI 不伪装已储存。
- [ ] AI 字段来源可见、用户修改可见、重分析不静默覆盖。
- [ ] 保存失败保留照片/文字/草稿/修改；重复提交不产生重复；删除/封存/冲突有影响说明。
- [ ] 所有统一状态有视觉、文字、持久反馈和恢复 CTA；离线/待同步/已储存/已同步分开；局部失败不阻塞。
- [ ] 360/768/1024/1280/1440 无关键溢出；桌面侧栏、平板抽屉、移动导航抽屉；详情 Drawer/全页；移动表格优先列。
- [ ] 48px 目标；Tab/Enter/Space/Esc/Ctrl/Cmd+K/N/Ctrl/Cmd+S；输入框不误触发；focus trap/回焦；语义 table；图表替代。
- [ ] Light/Dark、WCAG AA、缩放、高对比、reduced motion 通过；无 3D/粒子/shader/视差/彩虹/循环；skeleton/spinner 分工合理。

## 12. Sources / Skills Limitations

已使用 `02-need-report.md`、`03-form-report.md`、`04-visual-report.md`、`05-ia-report.md`、仓库 `src/app`/`src/components`，及 Mobbin、60fps、表格/表单/状态/无障碍研究。TinyFish/MCP 不可用，React Bits/Pinterest 动态失败；Awwwards/Supahero/Godly 仅视觉目录；已读取 `@sentiolabs/pi-frontend-design`；design-dna/web-perf 可用但未执行；外部 Web accessibility/UX/copywriting skill 不可用，使用内建 WCAG/键盘/状态 checklist 兜底。未做真实用户、屏幕阅读器、性能或大数据量压力测试；未验证当前代码已有完整离线/幂等/冲突能力。本报告不含生产代码，也不涉及原生 App。
