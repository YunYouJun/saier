---
title: P10-01 · Brush cloud sync
---

# P10-01 · 自定义笔刷云同步

- **Phase / ID**: P10-01
- **Depends on**: P9-06、YunLeFun shared storage gate
- **Files**: `packages/core/src/controller/PainterController.ts`、`site/app/utils/brushLibrary.ts`、`site/app/composables/useYunlefunBrushLibrary.ts`、`site/app/components/SiteCloudSyncDialog.vue`
- **Effort**: M

## Context

P9 已经提供运行时自定义笔刷，但此前只存在于当前页面内存。P10-01 把自定义笔刷提升为账号级云端笔刷库：用户保存自定义 preset 后，登录同一 YunLeFun 账号的其它浏览器可以拉取到同一笔刷。

笔刷库不是免费偏好数据。它作为小型 JSON 文件进入 YunLeFun shared storage，与 `.saier.project.json` 项目文件共享普通用户 100MiB / 会员 1GiB 配额；单个笔刷库额外限制 256KiB。

## Contract

笔刷库文件：

```json
{
  "format": "saier.brush-library.v1",
  "version": 1,
  "updatedAt": 1782960000000,
  "presets": []
}
```

- 固定文件名：`brush-library.saier.brushes.json`
- `presets` 只包含 `preset.custom === true && preset.source !== 'builtin'`
- `.myb` 只同步已映射成 `BrushPreset` 的结果
- 不同步内置笔刷、空分组、排序、当前选中笔刷、笔尖纹理二进制、真实 WASM engine

YunLeFun 新增专用 `user-storage-api`，承接通用 shared storage 动作；`account-api` 只保留账号 / 会员职责，不承载 Saier 项目文件或笔刷库状态机。`user-storage-api` 不新增 Saier / brush 专用 action：

- 拉取：`listStorageFiles({ appId: 'saier', kind: 'brush-library', slotKey: 'default', limit: 1 })`
- 预留：`reserveStorageUpload({ appId: 'saier', kind: 'brush-library', slotKey: 'default', fileName: 'brush-library.saier.brushes.json', sizeBytes, contentType: 'application/json' })`
- 确认：`finalizeStorageUpload({ reservationId, storageKey, fileId })`

`user_storage_files`：

- 项目文件：`kind: 'project'`，无 `slotKey`
- 笔刷库：`kind: 'brush-library'`，`slotKey: 'default'`
- 旧记录缺少 `kind` 时，仅 `.saier.project.json` 后缀按项目处理

`user-storage-api` 只维护 storage quota、reservation、file lifecycle 和 app/kind policy，不解析 `saier.brush-library.v1` 或 `BrushPreset`：

```json
{
  "appId": "saier",
  "kind": "brush-library",
  "maxBytes": 262144,
  "contentTypes": ["application/json"],
  "singletonBy": ["userId", "appId", "kind", "slotKey"]
}
```

## Acceptance

- [x] `PainterController.brush.listPresets()` 返回 defensive clone。
- [x] `saier.brush-library.v1` 解析 / 序列化 / 256KiB 限制 / 合并策略有单测。
- [x] site 新增 `useYunlefunBrushLibrary()`，支持 cloud pull、upload、localStorage fallback。
- [x] 登录后自动拉取云端笔刷；保存 / 删除自定义笔刷后 debounce 上传。
- [x] Cloud Sync dialog 显示笔刷库数量、上次同步时间、同步失败提示。
- [x] 项目文件列表过滤 `kind: 'brush-library'`。
- [x] 前端使用 generic `listStorageFiles` / `reserveStorageUpload` / `finalizeStorageUpload`，通过 `kind + slotKey` 表达笔刷库文件。
- [x] 线上 `user-storage-api` 支持 `listStorageFiles` 的 `kind/slotKey` 过滤、`reserveStorageUpload` 的 app/kind policy 限制，以及 `finalizeStorageUpload` 的 singleton replacement，并通过真实账号 smoke。

## Browser Smoke Notes

2026-07-02 验证：

- `http://localhost:8080` 会被 YunLeFun SSO 拦截：origin 不在 SSO 白名单。
- 用 `https://saier.yunle.fun` 代理本地 dev server 后，测试账号可登录，site 显示账号态。
- 保存自定义笔刷后会写入 `saier:brush-library:{uid}`，内容为 `saier.brush-library.v1`，刷新后可恢复。
- 删除自定义笔刷后 UI 回到内置 preset，localStorage 中笔刷库更新为 `presets: []`。
- Cloud Sync 能显示笔刷库状态，项目列表没有混入 brush library。
- 阻塞：线上需要部署独立 `user-storage-api`，并补 generic `kind/slotKey` policy 和 singleton replacement；`getStorageQuota` 偶发返回 `同步云空间配额并发冲突，请重试`。

2026-07-03 验证：

- 线上 `user-storage-api` 已部署独立 shared storage gate，`account-api` 不承载 Saier storage action。
- Saier 通过 generic `downloadStorageFile` 下载项目文件和笔刷库；后端只校验 owner / active / maxBytes，不解析 `saier.brush-library.v1`。
- Playwright 以 `https://saier.yunle.fun` origin 代理本地 production build，真实账号完成项目上传 / 刷新 / 下载导入 / 删除。
- 笔刷库保存后上传；清除 `saier:brush-library:*` 本地缓存并刷新后可从云端拉回；删除并同步空库后，清缓存刷新不再出现。
- 项目文件列表未显示 `kind: 'brush-library'` 文件；smoke 后项目列表和自定义笔刷均清理为空。

## Out of scope

- 真实 `MyPaintBrushEngineWasm`。
- `.myb` 像素级 parity。
- 笔尖纹理 / WASM asset 云同步。
- 完整 Brush Studio。
