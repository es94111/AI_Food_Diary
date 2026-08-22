# AI Food Diary 跨平台 UI 设计规范

> 深度模式总审核归档版。完整规范请参阅 [`docs/ui-design-spec.md`](../ui-design-spec.md)。

## 总结

AI Food Diary 采用“温暖专业、AI 可编辑优先”的跨平台 Design DNA：暖米色/象牙色画布、深炭/深橄榄文字、Amber/terracotta 品牌强调、蛋白质/脂肪/碳水/饮水稳定语义色、4px 间距基线、14px 字段圆角、20px 卡片圆角、28px Android Sheet 圆角、柔和层级和有限动效。

共享内容模型：

```text
日期 → 餐点 → 食物项目 → AI 草稿 → 用户确认 → 已储存餐点
```

核心闭环：

```text
拍照/相簿/手动 → AI 分析 → 可编辑草稿 → 确认并储存 → 每日反馈
```

Web 与 Android 共享品牌、字段、状态、内容和 token 语义，但不复制布局：

- **Web**：饮食/健康/食物/设置四区；桌面使用持久侧栏、工作区、辅助面板、双栏审核、表格/历史比较和键盘操作；平板折叠侧栏、抽屉/单栏。
- **Android**：饮食/健康/设置三项底部导航；食物作为饮食流程和设置中的上下文入口；单列、相机优先、Bottom Sheet、全屏 AI 审核、系统安全区、返回手势和移动信息密度。

## 冻结的核心决策

1. AI 是助手，不是裁判；分析完成不等于储存完成。
2. 未确认的 AI 草稿不能自动成为正式餐点。
3. 保存失败保留原始输入、草稿和用户修改；离线不得伪装为已同步。
4. Web 保留四区导航；Android 保留三项底部导航。
5. Health Connect 权限只影响健康同步，不阻塞饮食记录。
6. 状态中心按“需要你处理 / 处理中 / 稍后重试 / 已完成”提供跨模块恢复入口。
7. 默认摘要优先、详情渐进披露；不建立割裂的两套用户模式。
8. 台湾繁体中文作为当前内容基准；正式界面统一使用“储存”。

## 核心 token 摘要

```yaml
brand.primary: {light: "#B45309", dark: "#FBBF24"}
brand.soft: {light: "#FEF3C7", dark: "#2A2012"}
accent.terracotta: "#D96343"
accent.olive: "#596B32"
surface.canvas: {light: "#FDF6EC", dark: "#14110F"}
surface.default: {light: "#FFFFFF", dark: "#211C19"}
content.primary: {light: "#292320", dark: "#F5F0EA"}
content.secondary: {light: "#57534E", dark: "#B8AFA5"}
macro.protein: "#0EA5E9"
macro.fat: "#F59E0B"
macro.carbs: "#F43F5E"
macro.water: "#0284C7"
font: "Plus Jakarta Sans + Noto Sans TC/PingFang TC/Microsoft JhengHei fallback"
spacing: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96]
radius: {field: 14, card: 20, modal: 24, androidSheet: 28, pill: 9999}
minimumTouchTarget: 48
```

宏量颜色只表达数据分类，不表达好坏；任何状态或图表必须同时有文字、数值、图例或图标。Web glass/ambient light 只作为低强度背景或辅助面板装饰；Android 使用 Material surface，不移植全局玻璃。

## 页面与状态

P0 页面：登录/注册、今日饮食、记录一餐、AI 草稿审核、餐点详情、每日反馈、草稿/待处理。

P1 页面：历史、健康概览、营养趋势、饮水、体重、活动、Health Connect 状态、我的食物。

P2 页面：条码、营养标示、完整食物库、AI 设置、Google、隐私/图片、更新。

共享状态：`idle`、`input`、`captured`、`uploading`、`analyzing`、`review`、`review-unsaved`、`saving`、`saved`、`offline`、`pending-sync`、`error`、`permission-required`、`permission-denied`、`syncing`、`sync-failed`、`empty`、`conflict`。

核心文案：

- `正在分析这张相片…`
- `AI 分析完成，尚未储存。`
- `AI 估算・待确认`
- `确认并储存`
- `储存未完成，草稿仍保留。`
- `目前离线；可以先建立草稿，连线后再同步。`
- `尚未连结健康资料；这不影响你的饮食记录。`
- `找不到「{关键词}」；试试其他关键字，或新增一个食物。`

关键错误不能只放 Toast/SnackBar；长任务必须可离开并从状态中心恢复。AI 估算使用“约”或范围，不显示未经确认的精确百分比；健康反馈使用“目前进度/与目标的差距”，不用羞辱或医疗诊断语言。

## 无障碍与平台验收

- WCAG AA：正文对比度至少 4.5:1，大字至少 3:1。
- Web 全流程键盘可用，焦点可见，Dialog/Drawer 焦点可进可回。
- Android 触控目标至少 48×48px，支持安全区、系统返回、TalkBack、系统大字和 reduced-motion。
- 状态不能只用颜色；图标按钮有可读名称；图表有文字摘要；字段有 label、单位和错误关联。
- 320/375/414px Android、768/1024/1280px Web、慢网/断网/恢复、AI 成功/失败、保存失败、Health Connect 拒绝和多设备冲突都需验证。

## 待确认产品决策

目标地区/语言/单位/时区；深色模式范围；Logo/字体资产；Android 离线创建与草稿清理；储存/同步正式定义与冲突策略；AI 信心度和可编辑字段；图片保存/第三方处理/删除；Health Connect 数据范围和读写；目标与每日反馈触发；Google 登录/绑定；条码/标签上线时间；我的食物边界；特殊人群提示；通知和最低 Android 版本。

> 完整的页面结构、路由建议、组件变体、动效时长、内容词典、状态矩阵、风险、验收标准和参考来源位于 [`docs/ui-design-spec.md`](../ui-design-spec.md)。本归档仅为本轮总审核产物，不代表生产代码已实现。
