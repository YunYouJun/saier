---
title: Public Beta Checklist
---

# Public beta 发布前 checklist

> 这份清单是 P9 后的发布收口，不等同于继续扩展引擎功能。目标是让用户第一次打开 site / 安装包时不会踩到明显断点。

## Blocking

- [x] **Mask 状态定稿**：P6-04 API / 像素路径已由 browser 测试覆盖；默认用户 UI 只发布 lock alpha / clipping，不把 mask UI 作为正式能力承诺。
- [x] **文档同步**：`README`、`docs/guide/`、`site` 文案统一到 `saier` / `@saier/*`，旧 `pixi-painter` 只保留为 legacy alias 说明。
- [x] **自定义笔刷说明**：已补 [Custom Brushes](../guide/custom-brushes)，覆盖 `createCustomPreset()` / `registerPreset()` / `.myb` 映射，并说明当前是运行时自定义，持久化需由宿主保存 preset 数据。
- [x] **发布 alias 策略**：正式发布主包 `saier`；旧 npm 包 `pixi-painter` 仅作为 deprecated compatibility alias 处理。发布步骤：先发布同版本 `saier`，再发布/更新 `pixi-painter` alias 包或执行 `npm deprecate pixi-painter@"<目标版本范围>" "pixi-painter has moved to saier; install saier instead"`；文档与站点不再推荐旧包名。
- [x] **完整 gate**：2026-07-01 已通过 `eslint .`、`tsc --noEmit`、`vitest`、`unbuild`(core / pixi / saier)、Nuxt production build、VitePress build。Codex runtime 的 `pnpm` 包装器会先触发非 TTY dependency purge 并失败；项目门禁用等价本地二进制验证。
- [x] **手动 smoke**：2026-07-01 已用生产构建 + Playwright 覆盖 site 新建画布、画笔、橡皮、图层、工程保存/读取、PNG 预览/下载、触控双指事件、压感事件抽样。
- [x] **YunLeFun 云同步前端 / 规则 gate**：2026-07-02 已切到 YunLeFun 统一云空间：普通用户 100MiB、会员 1GiB、单文件 200MiB，Saier 新上传走 `user-storage-api` 的 `reserveStorageUpload -> uploadFile -> finalizeStorageUpload`，删除走 `deleteStorageFile`；本地规则补齐 `user_storage_quotas` / `user_storage_files` 只读、`avatars/` 10MiB 兼容、`user-storage/` 200MiB、legacy `saier/projects/` 过渡访问。
- [x] **YunLeFun `user-storage-api` 后端 gate**：2026-07-03 已上线独立 `user-storage-api`，不把 Saier 项目文件或笔刷库动作放进 `account-api`；通用 shared storage 动作支持 `kind/slotKey` policy：`listStorageFiles` 可按 `kind: 'brush-library'` + `slotKey: 'default'` 过滤，`reserveStorageUpload` 按 app/kind 限制 `brush-library` 为 JSON 且不超过 256KiB，`finalizeStorageUpload` 支持同一 `userId + appId + kind + slotKey` 的 singleton replacement；`getStorageQuota` 并发冲突已读回同步结果兜底；下载走通用 `downloadStorageFile`，后端只校验 owner / active / maxBytes，不解析 Saier 业务格式。
- [x] **YunLeFun 云同步真实账号 smoke**：使用真实普通账号验证 50MiB 上传成功、120MiB 因 100MiB 配额失败；使用真实会员账号验证 150MiB 上传、刷新列表、下载导入、删除；使用绕过前端的请求验证 `>200MiB`、伪造 `storageKey`、伪造 `fileID` 均被后端拒绝；确认 `www.yunle.fun` 头像上传仍可用。2026-07-03 P10 scoped 浏览器 smoke 通过：用 `https://saier.yunle.fun` 代理本地 production build，真实账号完成项目上传 / 刷新 / 下载导入 / 删除，笔刷库保存 / 清本地缓存后刷新拉回 / 删除后刷新不再出现，且项目列表未混入 brush library。2026-07-03 真实普通账号大文件 / 权限 smoke 通过：`>200MiB` 预留拒绝，伪造 `storageKey` / `fileID` finalize 拒绝，50MiB 上传 finalize 成功，随后 120MiB 因 100MiB 普通配额拒绝，删除 50MiB 文件后 quota 回到基线。2026-07-03 `www.yunle.fun` 头像回归改为后端 `account-api.uploadAvatar` 上传并通过真实 Web Auth smoke，测试文件已清理。2026-07-03 已后台创建专用会员测试账号 `ylfmembertest`（uid `2073046148889456642`，不在文档记录密码），会员 quota 懒同步为 1GiB；真实浏览器完成 150MiB project reserve / upload / finalize，列表可见 active 文件，`downloadStorageFile` 返回下载 URL，随后删除释放配额，最终 `usedBytes` / `reservedBytes` 回到 0。
- [x] **云存储路线定稿**：当前 beta 使用 CloudBase Storage + `user-storage-api` 后端预留 / 确认 / 删除状态机，不直接接裸 COS；扩容购买以后再做，quota 文档预留 `addonQuotaBytes`。
- [x] **笔刷云同步路线定稿**：自定义笔刷库作为 `saier.brush-library.v1` JSON 文件进入 YunLeFun shared storage，共用项目文件 quota，单个笔刷库额外限制 256KiB；前端使用通用 storage actions + `kind: 'brush-library'` + `slotKey: 'default'`，项目列表按 `kind: 'project'` 过滤，避免笔刷库混入工程文件列表。

## Should

- [x] **笔刷持久化示例**：site 已提供账号级 localStorage fallback；2026-07-03 真实账号浏览器 smoke 已验证 YunLeFun shared storage 路径：保存自定义笔刷后上传 brush library，清本地缓存刷新可从云端拉回；删除后同步空库，清缓存刷新不再出现。
- [ ] **浏览器兼容矩阵**：Chrome / Edge / Safari 当前可用性与已知限制。
- [ ] **性能基线截图**：记录 1024² / 4096² 下 dab throughput、tile 数、内存估算。
- [ ] **错误提示**：backend 不支持 sampler、外部 engine 未加载、项目导入失败时有明确 UI 文案。

## Experimental

- [ ] 真实 `MyPaintBrushEngineWasm`。
- [ ] `.myb` 像素级 parity。
- [ ] PSD 完整兼容。
- [ ] 多人协作。
