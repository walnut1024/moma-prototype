---
version: alpha
name: MoMA Admin
description: 面向后台管理工作台的独立设计规范，以紧凑排版、浅色工作面和蓝色交互建立清晰的信息层级。
---

## Overview

MoMA Admin 的视觉定位是高密度桌面工作台。使用者需要长时间阅读、比较和处理结构化信息。深色平台栏界定工作环境，白色导航标明位置，浅灰画布承托白色内容面板；界面的重心始终是数据和当前任务。

设计遵循三个原则：用对齐与间距组织信息，用文字层级区分主次，用克制的蓝色标识交互。紧凑来自减少重复标题、空行和容器嵌套，不以缩小文字或隐藏操作换取密度。

本规范适用于后台管理的导航、列表、分析、详情、表单和浮层。租户前台、模型广场、订购、模型体验、租户 API Key 与组织成员、登录注册与认证、版本目录及营销页面不在适用范围内。

文档内的设计令牌定义精确取值，正文定义用途和组合规则；仅阅读本文件即可理解并应用这套视觉系统。业务字段、权限、计算口径、页面专属流程及工程实现不属于本规范。

## Colors

以冷灰中性色构成大面积背景，蓝色承担动作与选中提示，状态色用于反馈。颜色按语义复用，不按页面或业务模块另建主题。

```yaml
colors:
  primary: "#315fe8"
  primary-hover: "#2854d6"
  on-primary: "#ffffff"
  primary-container: "#edf3ff"
  neutral: "#f3f5f8"
  surface: "#ffffff"
  surface-subtle: "#f8faff"
  on-surface: "#263247"
  on-surface-variant: "#586982"
  text-muted: "#5d6b82"
  outline: "#e4eaf3"
  divider: "#e8edf5"
  platform: "#252525"
  on-platform: "#ffffff"
  success: "#198754"
  warning: "#8a5d18"
  warning-container: "#fff8e8"
  error: "#c43228"
  error-container: "#fff1f0"
```

| 角色 | 令牌 | 使用规则 |
| --- | --- | --- |
| 主要交互 | `primary`、`primary-hover`、`on-primary` | 主按钮用蓝底白字；文字操作用蓝字，悬停加下划线或加深颜色。 |
| 选中提示 | `primary-container` | 导航和选中行的浅蓝底，搭配 `primary` 或 `on-surface` 文字。 |
| 背景与表面 | `neutral`、`surface`、`surface-subtle` | 分别用于工作画布、内容面板、表头与悬停底色。 |
| 文字层级 | `on-surface`、`on-surface-variant`、`text-muted` | 分别用于正文与关键数据、标签与表头、辅助说明；辅助文字保持可读。 |
| 分隔 | `outline`、`divider` | 分别用于容器细边界与行分隔，线宽 1px；浅色线不独自承担交互控件的识别。 |
| 平台栏 | `platform`、`on-platform` | 仅用于顶部平台栏及其文字，不延伸为内容区深色主题。 |
| 状态反馈 | `success`、`warning`、`error` | 分别表达成功、警告、错误，必须伴随状态文字或图标；警告和错误提示可使用对应浅底。 |

普通文字与实际背景的对比度至少为 4.5:1；必要的控件轮廓、选中标识与焦点指示至少为 3:1。输入控件使用 `on-surface-variant` 描边；`outline` 与 `divider` 仅承担装饰性分隔。状态绿用于白底文字，蓝底白字用于主要动作；不得通过降低整块容器透明度削弱有效内容的对比度。

## Typography

中文采用系统无衬线字形，正文紧凑而清晰。字号、字重和行距共同形成层级，避免在同一区域堆叠多种标题样式。技术标识使用等宽字体，数字比较使用等宽数字。

```yaml
typography:
  title:
    fontFamily: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.5
  title-chart:
    fontFamily: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
  navigation:
    fontFamily: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 13px
    fontWeight: 500
    lineHeight: 20px
  body:
    fontFamily: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.5
  caption:
    fontFamily: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.5
  metric:
    fontFamily: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.02em
    fontFeature: '"tnum"'
  code:
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace'
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.5
```

- `title` 用于紧凑页头和分组标题，`title-chart` 用于图表标题；`navigation` 用于侧栏和内容页签。
- `body` 用于正文、表格、按钮及输入内容，`label` 用于字段标签和表头；`caption` 仅用于短说明，不承担主要操作或长段正文。
- `metric` 用于汇总数值，单位采用 `body` 并与数字基线对齐；`code` 用于标识符及短代码，不用于普通说明。
- 对象名称与标识可分为上下两行，主名称在上、辅助标识在下。只有可打开内容的名称才使用链接样式。
- 数值比较列右对齐并使用等宽数字，名称和状态左对齐；表头与列内容对齐。长文本优先换行或扩展区域，截断时提供完整内容的查看方式。

## Layout

采用顶部平台栏、左侧导航和流式内容区的桌面布局。平台栏高 48px，面包屑栏高 42px，侧栏基准宽 184px；内容区占用剩余宽度。导航文字过长时允许侧栏增宽或换行，不能通过缩小字号隐藏层级。

```yaml
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 24px
```

| 场景 | 间距规则 |
| --- | --- |
| 图标与文字、标签与说明 | `xs` |
| 同组控件、页面外边距、相邻面板 | `sm` |
| 表格单元格水平内边距、紧凑面板内边距 | `md` |
| 表单字段组、图表面板内边距 | `lg` |
| 弹层内边距 | `xl` |
| 长表单的大分组间距 | `xxl` |

通用页面结构由内容类型决定：列表将筛选、表格和分页组合在同一工作面板；分析页按筛选、指标、图表、明细展开；详情页先呈现对象身份和操作，再排列页签或分组内容。每个区域只保留一个表达身份的标题，相关内容共享容器与对齐线。

内容宽度不足时，筛选与操作栏自然换行，多列表单逐步改为单列，图表由并排改为纵排。宽表只在表格区域横向滚动，关键操作保持可达；窄窗口的侧栏收为可展开导航。主内容不因固定侧栏产生整页横向溢出，文字放大后不裁切控件或说明。

浮层与视口四边至少留出 `lg` 空间，贴边抽屉除外；长表单只滚动主体，标题、关闭和操作区保持可达。下拉菜单向可用空间展开，不被表格或滚动容器裁切。

## Elevation & Depth

页面层次由灰色画布、白色表面、1px 分隔线和间距构成。普通面板、表格和按钮不使用投影；内容区内部优先分组与分隔，避免连续嵌套带边框的卡片。

| 层级 | 外观 | 用途 |
| --- | --- | --- |
| 基础内容 | 无阴影 | 页面、面板、表格。 |
| 轻浮层 | `0 4px 12px rgba(38, 50, 71, 0.12)` | 菜单、选择列表、提示框。 |
| 模态浮层 | `0 12px 32px rgba(38, 50, 71, 0.18)` | 对话框与抽屉。 |
| 模态遮罩 | `rgba(23, 35, 56, 0.40)` | 降低背景干扰，不使用模糊或玻璃效果。 |

遮罩覆盖底层界面，模态内容位于遮罩之上，其内部菜单和提示继续位于内容之上；固定表头、平台栏和操作列不得遮住浮层。层次跟随阅读和操作关系，不使用任意叠高来制造强调。

颜色反馈过渡为 120ms，浮层出现与关闭为 160ms，均采用 ease-out。尊重减少动态效果的系统设置，关闭非必要过渡；数据刷新不使用整页入场、弹跳或漂移动画。

## Shapes

使用平直矩形和小圆角。表格保留清楚的行列边界，圆角用于控件与容器外围，不逐行包成卡片。

```yaml
rounded:
  none: 0px
  panel: 6px
  input: 8px
  button: 10px
  dialog: 12px
```

`panel` 用于内容面板，`input` 用于输入与选择控件，`button` 用于按钮，`dialog` 用于对话框；贴边抽屉和表格内部使用 `none`。同一角色保持同一圆角，不以业务模块区分形态。

图标使用统一线性风格、2px 描边和 16px 基准尺寸，与文字间距采用 `spacing.xs`。圆形用于头像和状态点；按钮、筛选项和页签保持矩形。纯图标按钮保留 32px 操作区域，并有可访问名称。

## Components

组件使用下列基础令牌。带状态后缀的条目只覆盖同名前缀组件的对应属性，其余尺寸、字体和圆角保持一致。边框、阴影和焦点按本节与前述章节的文字规则应用。

```yaml
components:
  canvas:
    backgroundColor: "{colors.neutral}"
  platform-bar:
    backgroundColor: "{colors.platform}"
    textColor: "{colors.on-platform}"
    typography: "{typography.navigation}"
    height: 48px
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.panel}"
    padding: "{spacing.md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.button}"
    height: 32px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.button}"
    height: 32px
  button-secondary-hover:
    backgroundColor: "{colors.surface-subtle}"
  button-link:
    textColor: "{colors.primary}"
    typography: "{typography.body}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.input}"
    height: 32px
  navigation-item-selected:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.primary}"
    typography: "{typography.navigation}"
  table-header:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label}"
    height: 38px
  table-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
  table-row-hover:
    backgroundColor: "{colors.surface-subtle}"
  metric-value:
    textColor: "{colors.on-surface}"
    typography: "{typography.metric}"
  caption-text:
    textColor: "{colors.text-muted}"
    typography: "{typography.caption}"
  divider:
    backgroundColor: "{colors.divider}"
    height: 1px
  status-success:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.success}"
    typography: "{typography.body}"
  status-warning:
    backgroundColor: "{colors.warning-container}"
    textColor: "{colors.warning}"
    typography: "{typography.body}"
  status-error:
    backgroundColor: "{colors.error-container}"
    textColor: "{colors.error}"
    typography: "{typography.body}"
  tooltip:
    backgroundColor: "{colors.on-surface}"
    textColor: "{colors.surface}"
    typography: "{typography.caption}"
    rounded: "{rounded.panel}"
    padding: "{spacing.sm}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.dialog}"
    padding: "{spacing.xl}"
```

### 按钮与交互状态

同一任务区域突出一个主动作；次要按钮使用白底、正文色与 `on-surface-variant` 的 1px 描边，行内操作使用文字按钮。文字按钮无填充，只放在 `surface`、`surface-subtle` 或 `neutral` 表面；悬停及键盘焦点显示下划线。标准按钮高 32px、水平内边距为 `spacing.md`，同一行控件高度一致。

| 状态 | 统一反馈 |
| --- | --- |
| 悬停 | 主按钮加深蓝色，次要按钮和可操作行使用浅色底；只读内容不伪装成可点击状态。 |
| 键盘焦点 | 控件外侧显示 2px 的 `primary` 实线，偏移 2px；深色平台栏使用 `on-platform` 焦点线。 |
| 按下 | 保留清晰边界，主按钮使用 `primary-hover`，不改变布局或缩放文字。 |
| 选中 | 浅蓝底或蓝色指示线，配合勾选、字重或可访问的选中状态，不只依赖颜色。 |
| 禁用 | `neutral` 底与 `text-muted` 文字，无悬停高亮；必要时说明不可用原因。 |
| 加载 | 在原操作区域显示进度，保持控件宽度和可理解的操作名称。 |
| 只读 | 保留正文对比度，以文本或明确的只读字段呈现，不与禁用混淆。 |

### 表单与选择控件

标签位于输入框上方，标签与输入间距为 `spacing.xs`，字段组间距为 `spacing.lg`。输入、选择器和多行输入统一白底、正文色与 1px 的 `on-surface-variant` 描边；多行输入随内容增高，不受单行高度限制。占位提示不替代标签，必填、帮助与错误紧邻字段。

错误字段使用 `error` 边框、错误图标和文字说明。复选框与单选框的标记为 16px，标签与控件共同构成至少 32px 高的点击区域；选中用蓝底白色勾选或圆点，复选框的部分选中用横线区分。下拉选项高至少 32px，悬停使用 `surface-subtle`，选中附勾选标记；长列表在菜单内部滚动。

### 导航与页签

侧栏使用白底、静态分组标签和单行图标文字菜单，当前项使用选中令牌。工作区域切换采用浅灰底槽与白色选中块；同一对象的内容分类采用下划线页签，选中项加粗并显示 2px 蓝色底线。筛选条件使用表单控件或条件标签，不堆叠为多层页签。

面包屑以正文与辅助色区分当前位置和父级，父级链接提供悬停及焦点反馈。导航、页签和展开入口均可使用键盘操作，当前位置有可访问的文字标识。

### 表格与筛选

筛选栏位于表格上方，与表格和分页共享白色面板。控件间距采用 `spacing.sm`；已选条件以“字段：值”呈现，超过可用宽度时换行。分页位于表格下方，总数与翻页控件集中排列。

表头高 38px；单行数据行最小高 40px，双行身份数据行最小高 60px，内容增多时自然增高。单元格水平内边距为 `spacing.md`，行间使用 `divider` 分隔。固定表头和操作列使用不透明表面，不覆盖正文；行悬停不代替真正的选中状态。

长内容可换行或截断，完整值可经键盘或指针触发的详情、提示取得。数值显示单位，缺失值使用“—”，零值显示为“0”；错误原因不能仅靠省略号表达。

### 指标与图表

指标按名称、主数值、单位、辅助说明分层，同组数值与单位基线对齐。时间趋势使用折线图，类别比较使用条形图，少量类别的构成使用环形图；图表标题、图例、绘图区和单位保持一致的对齐关系。

单系列默认使用 `primary`。多系列用稳定的颜色映射并配合线型、标记或直接标签；颜色不随排序改变。图例清楚标识对象，缺失数据保留断点，核心数据可通过文本或表格读取，不仅依赖悬停提示。

### 浮层与反馈

短表单使用居中对话框，保留上下文的详情使用右侧抽屉。标题左对齐，关闭入口位于右上，底部操作靠右，主要操作在末位。模态打开后焦点进入内容，键盘焦点保持在模态内，关闭后恢复到触发入口；嵌套菜单先关闭最上层。

提示框用于短说明，支持悬停和键盘焦点触发，不能承载唯一的必读信息。短暂操作反馈在右上角以白底通知展示，状态图标与正文并排；字段错误留在字段旁，需要持续处理的问题使用内容区提示条。

加载保留内容骨架，空状态提供原因和下一步，无结果状态保留筛选与重置入口，失败状态提供原因和重试入口。反馈文字说明发生了什么以及可采取的动作；重要结果不只通过瞬时通知表达。

## Do's and Don'ts

- **Do:** 用统一的文字层级、列对齐和间距组织信息，让数据成为视觉中心。
- **Do:** 按语义选择令牌，同类组件共享尺寸、圆角和状态反馈。
- **Do:** 为颜色、图标、截断文字和悬停内容提供可读且可操作的替代方式。
- **Do:** 在窄窗口、文字放大和键盘操作下保持内容、焦点及主要动作可达。
- **Don't:** 为单个页面另建主色、字体或圆角体系，或将局部页面例外写成通用规则。
- **Don't:** 使用营销式大标题、装饰渐变、玻璃效果、重阴影或多层卡片包装管理数据。
- **Don't:** 依靠缩小正文、降低对比度、隐藏关键内容或重复标题来安排布局。
- **Don't:** 把业务流程、权限逻辑、源码位置、版本差异或实施记录混入设计规范。
