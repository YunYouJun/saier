# Activity UI primitives

第一方 Activity 插件统一从 `~/components/activity` 引入 UI 原语，并由
`SiteActivityPluginHost` 提供 `activity.css` 与 Saier 主题变量。

```vue
<script setup lang="ts">
import {
  SiteActivityButton,
  SiteActivityField,
  SiteActivityPanel,
} from '~/components/activity'
</script>

<template>
  <SiteActivityPanel tag="form" icon="i-ph-game-controller" title="Activity">
    <SiteActivityField label="Room name">
      <input class="site-activity-control">
    </SiteActivityField>
    <SiteActivityButton type="submit" variant="primary">
      Create
    </SiteActivityButton>
  </SiteActivityPanel>
</template>
```

约定：

- 面板、按钮、字段、命令栏和页面标题优先使用公共组件，不复制结构样式。
- 原生 `input`、`select`、`textarea` 使用 `site-activity-control`，保留原生语义和类型。
- 只使用 `--saier-color-*` 变量，不在插件内维护固定主题。
- 默认控件高 36px，紧凑按钮高 32px，面板圆角 8px；插件仅定义业务布局。
- 插件自行维护业务文案与 locale，宿主只维护通用加载、失败和关闭文案。
- 公共组件不持有玩法状态；状态通过 typed props、slots 和 emits 显式流动。
