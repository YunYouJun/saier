---
title: UI Design Guidelines
---

# UI 统一设计规范

本页统一云绘工作台的 DOM 界面与交互约定，适用于桌面端、移动端及复用这些界面的平台壳。新增或修改工具栏、面板、菜单等界面时，遵循本页；跨组件的通用规则也维护在这里。

UI 与绘画引擎的职责边界见 [D7 · UI 分层](./decisions#d7)。本页中的尺寸使用 CSS 像素，不随画布缩放或 DPR 换算。

## YunLeFun Editor 分类

云绘采用云乐坊 Design 的 **Editor · 复杂操作界面** 分类。它与消费端共享品牌色和语义状态，但使用独立的中性面板、系统字体与紧凑密度。浅色银灰、深色石墨灰；macOS 风格体现在清晰的工具层次、细分隔线、紧凑属性行和柔和中性阴影。

上游源文件是 `YunLeFun/design` 的 `packages/ui/styles/editor.css`，规范见其 `packages/guide/editor.md`。发布前由本仓库 `packages/vue/styles/ylf-editor.css` 暂存相同 CSS，`tokens.css` 与 `theme.css` 映射到现有 `--saier-*` 接口。更新时同步两个文件；不能通过改变消费端全局圆角来调整 Editor。正式包入口为 `@yunlefun/ui/editor.css`，当前尚未发布。

- 属性值采用等宽数字，标签 / 值 / 单位对齐；坐标与尺寸成组。
- 图层行保持紧凑，长名称截断并提供完整 title，选中以浅蓝色底表达。
- 文件选择使用 `PainterFileInput` 保留原生 input 行为，外观统一；`editor-form.css` 仅对 `.saier-editor-form` 生效。
- 常用导出操作并排排列；高级素材与 AI 配置按需展开，错误与计费结果持续可见。
- 字体使用系统 UI 字体；画布和导出图像不受主题影响。

## 基础约定

- **主题**：颜色、边框与阴影复用 `site/app/assets/theme.css` 中的 `--saier-color-*` / `--saier-shadow-*` 语义变量；共享 Vue 控件沿用这些变量，并保留独立使用时的回退值。
- **控件**：优先复用 `packages/vue/components/` 中的滑块、工具切换器等基础控件；同一行为在桌面与移动端采用一致的状态语义。
- **交互**：装饰效果不阻挡点击、触摸或滚动；保留键盘操作、可访问名称与可见焦点。

## 密度 token 与共享组件

尺寸、间距和字阶的唯一来源是 `packages/vue/styles/tokens.css`，宿主通过 `@saier/vue/styles/tokens.css` 引入；共享控件也直接引入该文件，保持在示例与独立应用中可用。主题颜色仍由宿主 `theme.css` 提供，品牌六色沿用 `brand.css`，不在控件内另造调色板。

| 类别   | Token                                                                          | 默认桌面值        |
| ------ | ------------------------------------------------------------------------------ | ----------------- |
| 间距   | `--saier-space-1` 至 `--saier-space-4`                                         | 4 / 8 / 12 / 16px |
| 图标   | `--saier-icon-size`                                                            | 16px              |
| 按钮   | `--saier-control-size-sm` / `--saier-control-size` / `--saier-control-size-lg` | 24 / 28 / 40px    |
| 圆角   | `--saier-radius-control` / `--saier-radius-panel`                              | 5 / 10px          |
| 面板   | `--saier-panel-width` / `--saier-panel-header-height`                          | 272 / 32px        |
| 顶部行 | `--saier-chrome-row-height`                                                    | 32px              |
| 文字   | `--saier-font-size-caption` / `--saier-font-size-control`                      | 11 / 12px         |

`pointer: coarse` 下按钮、标题栏和滑块命中区域自动增大。修改整体密度时调整 token，业务组件只保留必要的布局规则，不再重复按钮的 hover / selected / disabled / focus 样式。

- **`PainterIconButton`**：原生按钮，提供可访问名称、三种尺寸和状态样式。默认保持原有 40px，工具栏显式用 `md`，面板操作用 `sm`。
- **`PainterToolbar` + `PainterToolbarButton`**：组合 Reka Toolbar 的方向键导航及禁用项跳过；通过 `as-child` 复用图标按钮，不嵌套原生按钮。分隔线统一使用 `painter-toolbar__separator`。
- **`PainterPanelHeader`**：标题与 `actions` 插槽。桌面壳的 `panel-actions` 插槽承载图层 / 导航操作，内部面板用 `showHeader=false` 避免重复标题；独立组件与移动布局保留自身标题。
- **`PainterSlider`**：`panel` 为上下两行，`compact` 用于工具栏，`row` 用于面板内的「标签 / 滑块 / 数值」对齐布局。
- **`PainterDisclosure`**：原生 `details/summary`，折叠时保留内容与参数状态。画笔动态默认折叠；混色笔刷的颜色混合设置按需展示。

工作台默认显示画笔、颜色、图层、导航；诊断和 RGB 数值滑块通过窗口菜单按需开启。选中项使用少量强调色，常规面板标题、动作按钮不添加常驻彩色底或多层边框。

## 横向滚动的边缘渐变 {#scroll-edge-fade}

### 目的与适用场景

单行工具栏、标签栏或紧凑选项列表存在横向溢出时，用边缘渐变提示该方向还有内容。渐变跟随实际可滚动范围，不作为常驻装饰。

当前工作台采用从左到右的排列，以**右侧渐变**作为默认规则；不额外添加左侧渐变。该规则用于 DOM 控件区域，不用于画布、图片预览或导出内容。

### 状态规则

| 状态                                   | 右侧渐变                   |
| -------------------------------------- | -------------------------- |
| 内容完全可见，无横向溢出               | 隐藏                       |
| 位于起点或中间，右侧仍有隐藏内容       | 显示                       |
| 已滚到最右侧                           | 隐藏                       |
| 从最右侧向左滚动，右侧重新出现隐藏内容 | 恢复显示                   |
| 容器宽度、控件宽度或布局发生变化       | 根据新的可滚动范围重新计算 |

对当前从左到右的滚动容器，显示条件统一为：

```ts
const canScrollRight = element.scrollWidth - element.clientWidth - element.scrollLeft > 1
```

`1px` 是滚动边界的舍入容差，避免到达末端后残留渐变。

### 视觉规则

- 渐变区域从容器右边缘向内延伸 **32px**，由完全可见平滑过渡至透明；其余区域保持不透明。
- 使用 CSS `mask-image`，让内容自然融入容器后方的界面背景；浅色与深色主题使用同一份规则。
- 默认不添加切换动画，不改变工具排列、内容宽度或点击区域，也不修改原有滚动条策略。

```css
.scroll-region.can-scroll-right {
  mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
}
```

这里的 `#000` 表示遮罩的不透明端，不是界面的背景色。无隐藏内容时移除状态类，恢复完整显示。

### 实现与复用

1. 将状态监听和遮罩绑定到**实际发生滚动的元素**，而不是外围布局容器；嵌套容器尤其需要确认 `scrollLeft` 的变化位置。
2. 初次挂载时计算状态；滚动监听使用 passive 模式；通过 `ResizeObserver` 观察滚动容器及其内容的尺寸变化。语言切换、控件展开和窗口缩放后也应保持状态准确。
3. 桌面 / 移动布局切换或区域重新挂载时，绑定新元素；卸载时清理事件与观察器。如果动态替换内容根元素，也需要更新观察对象。
4. 渐变只提供视觉提示，不承担交互语义。保持原有焦点顺序、键盘滚动和触摸滑动，确保滚动至末端后最后一个控件完整可见、可操作。

当前参考实现：

- `site/app/composables/useToolbarScrollFade.ts`：提供右侧是否仍可滚动的只读状态，监听容器及已挂载工具组的尺寸变化，并清理监听。
- `site/app/components/SitePainterApplication.vue`：共享工具栏容器 `.site-painter-toolbar-stack` 绑定状态并应用遮罩，供桌面端与移动端复用。

后续同类区域应遵循上述规则并优先复用已有逻辑。当前已接入范围为共享工作台工具栏；其他区域尚未统一迁移，例如 `BrushPresetPicker.vue` 的分组栏仍采用常驻双侧渐变，后续调整时应按实际滚动状态对齐本规范。

### 验收标准

- 窄容器下，起点和中间有右侧渐变；到达末端后渐变消失，向左回滚后恢复。
- 内容完全可见时不显示渐变；缩窄 / 扩宽容器、切换语言或展开控件后，状态随尺寸正确更新。
- 桌面端与移动端切换后，渐变绑定到当前可见的滚动容器。
- 浅色与深色主题下边缘自然淡出；点击、触摸滑动、键盘导航与末端控件访问保持可用。
- 在运行当前源码的浏览器页面验证实际布局与滚动行为，避免使用旧构建判断效果。
