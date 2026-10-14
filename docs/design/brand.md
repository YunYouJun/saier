---
title: 品牌与色彩
---

# 云绘 Saier · 缤纷一笔

<img class="saier-app-icon" src="https://yunlefun-cos-1253292018.cos.ap-shanghai.myqcloud.com/desktop/app-icons/v1/pixi-painter.webp" alt="云绘 Saier 画笔与彩虹笔触应用图标" width="128" height="128" referrerpolicy="no-referrer" style="border-radius:21.5%">

应用图标采用历史会话里生成的 **画笔与彩虹笔触**：真实画笔、缤纷颜料与浅色纸面更直观地表达绘画。使用当时选定的原图，不重新生成近似版本。该图原先使用 `pixi-painter` 资产名；现在作为云绘 Saier 的应用图标，项目、包名与文件格式标识保持不变。

中文产品名为 **云绘**，英文产品名与开源项目名为 **Saier**。界面继续与 [YunLeFun Design](https://github.com/YunLeFun/design/blob/main/packages/guide/colors.md) 共用色板。原六色 S 矢量保留为旧版资产，以及远程图片不可用时的本地回退。

## 色板

| 色彩   | 色值      | 在云绘中的用途             |
| ------ | --------- | -------------------------- |
| 晴空蓝 | `#2563eb` | 主操作、链接、选中状态     |
| 青色   | `#06b6d4` | 品牌笔触、信息色的基础色相 |
| 鲜绿   | `#22c55e` | 品牌笔触、成功色的基础色相 |
| 明黄   | `#facc15` | 品牌笔触、提醒色的基础色相 |
| 珊瑚橙 | `#ff6b4a` | 品牌笔触、错误色的基础色相 |
| 桃粉   | `#ec4899` | 品牌笔触的收笔，表达创作   |

界面的细色条使用纯色分段；应用图标使用选定原图里的颜料渐变。工具栏与面板仍使用单一晴空蓝强调，不把应用图标的渐变扩展到工作台控件。

## 绘画优先的界面

- **Editor 浅色**：`#f6f6f7` 面板、`#ebebed` 工具栏、`#292a2e` 正文，使用银灰层次与晴空蓝交互强调。
- **Editor 深色**：`#292a2d` 面板、`#303033` 工具栏、`#eeeef0` 正文，蓝色 `#60a5fa` 用于交互强调。
- **画布周围**：浅色 `#d7d7da` 与深色 `#202123` 中性灰。纸张、透明棋盘格与导出图像不参与品牌换肤。
- **状态颜色**：浅底与文字成组使用。亮黄、青、绿等原始色不用作白底上的小字号文字。现有 `--saier-color-danger / warning / success / info` 同时用于文字与图标，因此使用可读的语义文字色，不能直接替换为原始亮色。
- **字体**：品牌标题采用系统圆体 `ui-rounded`，中文回退至苹方 / 微软雅黑；工具与正文沿用系统无衬线，不为工作台额外下载展示字体。
- **动效**：logo 保持静止；仅交互状态产生反馈。
- **关于窗口**：应用图标承担彩色品牌表达；浅色使用不透明暖白纸面，深色使用工作台的中性面板。版本与许可采用无填充的信息行和轻分隔线，保留键盘焦点、小屏滚动与关闭入口。

## 资产与维护

- `site/app/constants/brand.ts`：网站、文档站的小尺寸 favicon 路径、安装图标的固定 COS 地址及母版 SHA-256；不接受运行时输入 URL。统一预览与采用状态维护于 `YunLeFun/icons` 的 `assets/catalog/app-assets.json`。
- `site/public/favicon-brush-v1.svg`：浏览器标签页使用的小尺寸矢量伴随图，保留暖白纸面、深色斜画笔、金色笔箍和彩虹笔触；简化纹理、加粗轮廓，在 16 / 32px 下优先保证识别。文档站 `docs/public/favicon-brush-v1.svg` 保持相同内容；它不替换应用、Apple 或 PWA 图标的历史母版。
- `site/app/components/Logos.vue`：展示同一应用图标；桌面、移动端与关于弹窗复用，加载失败时回退本地 `site/public/logo.svg`，尺寸保持不变。
- `site/public/logo.svg` 与两站旧 favicon / 安装 PNG：保留的六色 S 旧版资产，不再是应用图标的活动来源。
- `site/app/assets/brand.css`：六色基础变量和分段色条；兼容宿主提供的 `--ylf-palette-*`，独立使用时保留对应回退值。文档站直接复用此文件。
- `site/app/assets/theme.css`：工作台明暗主题与状态色；文档站在自己的 VitePress 主题中映射相同品牌色。

1024px PNG 母版位于 [COS 原图](https://yunlefun-cos-1253292018.cos.ap-shanghai.myqcloud.com/desktop/app-icons/masters/v1/pixi-painter.png)，SHA-256 为 `49bb33e486d6326f19e57bf7e06c6d7df19a39fd954f06f1daf5724ba1e16e4d`，对应 COS 存储原对象；普通 GET 可能经桶的 imageSlim 自动压缩，响应字节的哈希会不同。常规展示使用 256px WebP；兼容 favicon、Apple 与 PWA 使用同一母版导出的 PNG，分别为 32、180、192、512px。二进制图片不进入源码或 npm 包；版本更新使用新的 COS 路径，不覆盖长期缓存的已有对象。

两站先声明 COS 32px PNG，再声明本地 SVG `sizes="any"`；浏览器根据类型和尺寸选择，未支持 SVG 的浏览器保留 PNG 回退。SVG 文件没有嵌入位图、外部资源、脚本或主题媒体查询，暖白纸面与深色画笔在明暗浏览器栏使用同一轮廓。站点 Service Worker 将本地 SVG 纳入既有静态资源预缓存。该小尺寸伴随图可作为文本源码维护；修改它时同步两站文件，并复查 16 / 32px、1× / 2× 显示。

兼容依据：[HTML Standard 的 icon 选择规则](https://html.spec.whatwg.org/multipage/links.html#rel-icon)；[Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/#svg-icons) 新增 SVG 图标支持，因此旧版 Safari 仍需要 PNG。

本次仅有静态扁平图，不声称它是 Icon Composer 分层文件或已验证的 maskable 图标。PWA 使用 `purpose: any`；native Electron 打包尚未配置应用图标，Capacitor 的 iOS / Android 项目尚未生成，之后的原生导出使用同一母版单独验收。

受 Service Worker 控制的联网访问后，网站仅缓存明确列出的固定图标地址。远程图标未缓存或 COS 不可用时，已加载的工作台使用本地旧 S 回退，尺寸和绘画功能保持不变。

只有维护六色 S 旧版资产时才运行：

```bash
node scripts/generate-brand-assets.mjs
```

该脚本仅导出旧版 S：文档 logo、两站旧 favicon、ICO、旧 PWA / Apple / maskable PNG。它不会覆盖 COS 上的画笔应用图标，也不改变 `brand.ts` 的活动来源。

配色依据：YunLeFun Design `c26f50fb5db99bb62d77b8845b7c817254e4ae18` 中的 `packages/ui/styles/css-vars.scss`。本次采用配色与品牌语言；完整组件库的依赖接入另行管理。
