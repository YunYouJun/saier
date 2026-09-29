---
title: 品牌与色彩
---

# 云绘 Saier · 缤纷一笔

<img src="/logo.svg" alt="云绘 Saier 六色 S 笔触标记" width="128" height="128">

Saier 的首字母 **S** 是一笔连续的绘画轨迹。蓝、青、绿、黄、橙、粉六段颜料沿笔势相接，宽阔的转弯与斜切收笔呼应画笔的运动。白色圆角底像一张小画纸，让标记在浅色与黑灰主题中保持相同的辨识度。

中文产品名为 **云绘**，英文产品名与开源项目名为 **Saier**。品牌与 [YunLeFun Design](https://github.com/YunLeFun/design/blob/main/packages/guide/colors.md) 共用色板，保留独立的 S 标记。

## 色板

| 色彩   | 色值      | 在云绘中的用途                   |
| ------ | --------- | -------------------------------- |
| 晴空蓝 | `#2563eb` | 主操作、链接、选中状态、S 的起笔 |
| 青色   | `#06b6d4` | 品牌笔触、信息色的基础色相       |
| 鲜绿   | `#22c55e` | 品牌笔触、成功色的基础色相       |
| 明黄   | `#facc15` | 品牌笔触、提醒色的基础色相       |
| 珊瑚橙 | `#ff6b4a` | 品牌笔触、错误色的基础色相       |
| 桃粉   | `#ec4899` | 品牌笔触的收笔，表达创作         |

使用纯色分段，不混合成彩虹渐变。全色板集中在 logo、文档品牌区和关于弹窗的细色条；工具栏与面板使用单一晴空蓝强调。

## 绘画优先的界面

- **Editor 浅色**：`#f6f6f7` 面板、`#ebebed` 工具栏、`#292a2e` 正文，使用银灰层次与晴空蓝交互强调。
- **Editor 深色**：`#292a2d` 面板、`#303033` 工具栏、`#eeeef0` 正文，蓝色 `#60a5fa` 用于交互强调。
- **画布周围**：浅色 `#d7d7da` 与深色 `#202123` 中性灰。纸张、透明棋盘格与导出图像不参与品牌换肤。
- **状态颜色**：浅底与文字成组使用。亮黄、青、绿等原始色不用作白底上的小字号文字。现有 `--saier-color-danger / warning / success / info` 同时用于文字与图标，因此使用可读的语义文字色，不能直接替换为原始亮色。
- **字体**：品牌标题采用系统圆体 `ui-rounded`，中文回退至苹方 / 微软雅黑；工具与正文沿用系统无衬线，不为工作台额外下载展示字体。
- **动效**：logo 保持静止；仅交互状态产生反馈。

## 资产与维护

- `site/public/logo.svg`：可编辑的矢量源文件，最小建议尺寸 24px；favicon 可缩至 16px。
- `site/app/components/Logos.vue`：只负责展示品牌图形；桌面、移动端复用该组件，关于弹窗引用相同 SVG。
- `site/app/assets/brand.css`：六色基础变量和分段色条；兼容宿主提供的 `--ylf-palette-*`，独立使用时保留对应回退值。文档站直接复用此文件。
- `site/app/assets/theme.css`：工作台明暗主题与状态色；文档站在自己的 VitePress 主题中映射相同品牌色。

修改源 SVG 后运行：

```bash
node scripts/generate-brand-assets.mjs
```

脚本使用已有的 Playwright Chromium，生成文档 logo、两站 favicon、16/32/48px ICO、192/512px PWA 图标、180px Apple 图标及独立 maskable 图标。maskable 版本使用不透明白底，将标记缩进中心安全区域。

配色依据：YunLeFun Design `c26f50fb5db99bb62d77b8845b7c817254e4ae18` 中的 `packages/ui/styles/css-vars.scss`。本次采用配色与品牌语言；完整组件库的依赖接入另行管理。
