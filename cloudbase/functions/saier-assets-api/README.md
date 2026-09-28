# Saier 私有水印素材代理

水印插件通过已有云乐坊登录会话调用此 Event 云函数。函数只代理 Drive 的
`/api/v1/library`；不另建素材表，不开放 COS bucket，不把 consumer token 交给浏览器。

## 状态与部署

**2026-09-28：云函数与 Drive 生产连接已部署，真实私有库读写验收通过。**
前端开关仍默认关闭，须在包含本工作台代码的发布中启用；现有生产 Saier 使用 GitHub
发布流程，构建成功不能等同于生产前端已更新。

目标环境沿用根目录 `cloudbaserc.json` 的 `yunlefun-8g7ybcxc7345c490`，函数为
`saier-assets-api`，Nodejs18.15 / 256 MB / 30 s。部署只选择本函数，避免覆盖其他函数。

已落地的资源与后续部署要求：

1. Drive 已开启 library/direct-upload 与统一 `user-storage-api`。2026-09-28 补齐
   `library_owner_id`、`object_item`、`library_group` 索引；元数据集合仍为 `ADMINONLY`。
   Drive 服务端独立令牌配置为 `NUXT_DRIVE_ASSET_STORAGE_INTERNAL_TOKEN`，存储函数中对应
   `DRIVE_STORAGE_INTERNAL_TOKEN`。素材桶为私有的 `yunlefun-private-1325586649`，
   配置项 `ASSET_PRIVATE_COS_BUCKET`；原有工程存储桶与其他应用变量均保留。
2. 在 Drive 注册第一方应用 `saier`，使用其正式 helper 生成 application grant ID。
   credential 与 grant 都只允许 `storage.read`、`storage.write`，绑定当前用户实际
   tenant/space；须与 Drive 网页里的个人库相同，不能另建 Saier 专属 space。
3. 以受信任流程生成独立 consumer credential，只在 Drive 存 secret hash。
   完整 `credentialId.secret` 注入本函数的 `SAIER_DRIVE_CONSUMER_TOKEN`。
   不能复用 Studio/Cover 的 token，也不能把明文写进 git、聊天或客户端配置。
4. 配置 `SAIER_DRIVE_LIBRARY_ENABLED=true`。未配置时函数返回 `NOT_CONFIGURED`。
5. 私有对象存储 CORS 加入实际 Saier 生产 origin；开发 origin 独立精确列出，不能使用 `*`。
   保留其他应用配置，允许签名 PUT 与 GET 所需头。
6. 按当前 CLI 的 `fn deploy` 帮助仅部署此函数；云端安装依赖。
   真实联调通过后设置前端 `NUXT_PUBLIC_SAIER_PRIVATE_ASSETS_ENABLED=true` 并重新构建开放入口。
   该开关仅控制界面，不能替代服务端授权。前端默认函数名相同，可通过 `NUXT_PUBLIC_SAIER_ASSETS_API_FUNCTION_NAME` 覆盖。

本次 Saier consumer credential 有效期至 **2026-12-27**，权限仅为 `storage.read` 与
`storage.write`，不包含删除、发布或永久引用授权。到期前由受信任管理流程轮换：先创建
同一空间的新凭据，再更新函数环境变量，验证后停用旧凭据；不自动扩大作用域。

生产 SSO 精确绑定 `https://saier.yunle.fun/`。普通 `http://127.0.0.1:8082/` 预览
不具备生产登录资格；本地账号联调使用仓库已有 `pnpm dev:site:sso` 的隔离开发环境，
不能把 localhost 加入生产登录注册表来绕过隔离。

**当前 Drive consumer credential 固定绑定一个 tenant/space。** 此实现仅服务该空间已授权
的登录用户，且列表、单个素材及上传均仍由 Drive 按 owner UID 隔离；不能用一个用户的
credential 为所有其他用户自动开通个人库。面向所有注册用户上线前，需要 Drive 提供
按用户授权的连接/凭据解析流程，或按实际空间逐个注册连接；不能放宽成通配 tenant grant。

## 信任边界

- 身份来自 CloudBase gateway 的 `app.auth().getUserInfo()`；忽略请求内 UID/headers。
- `expectedUserId` 仅检查客户端账号是否已切换，不能授予任何权限。
- 云函数固定 Drive origin、动作白名单及 download 能力；无删除、发布或任意 URL 转发。
- Drive 再次校验 credential scope、应用 grant、空间 membership、素材 owner 和配额。
- SDK `@yunlefun/assets@0.1.0` 验证请求/响应；幂等键由认证 UID + 动作 + 请求 ID 派生。
- 浏览器每次调用前检查真实 session，换号/退出时立即清列表、取消传输并丢弃迟到响应。
- 浏览器仅接收单对象短期 PUT/GET，传输不携带 cookies、不跟随重定向；读取校验大小和 SHA-256。
- 素材按明确点击上传，图片进入统一 Drive 私有库；角色、混合模式、布局在 Saier 工作文件中。
  选入的文件嵌入本地工作文件，主动分享该文件也会分享内嵌素材；不保存签名 URL。

## 验收与回滚

本地：`pnpm exec vitest run test/saier-assets-api.test.ts site/app/features/watermark/private-assets.browser.spec.ts`。
上线后用合成小 PNG 验证 reserve → signed PUT → complete → list → get/access → hash，
并用第二个账号尝试读取第一个账号的 ID，应返回不可访问；确认 Drive 页面能看到同一素材。
使用重复图片验证去重，用失败完成请求验证只重试 complete，不重复传字节或扣空间。
不得把用户画作自动上传作 smoke fixture。

2026-09-28 真实验收记录：

- Drive 发布 `dpeks2p2ey98` 成功，代码仍为原有已提交版本 `4fb59a0`，仅启用相关生产配置。
- 合成 PNG 为 68 bytes，素材 ID `ast_54cec7e7ad1f292358bf7e095a8e06cc5f60c02e755644ee`。
  已用实际登录会话在 Drive 网页验证同一文件可见，未上传用户画作。
- signed PUT 为 200；完成状态为 `ready`；重复 complete 与同内容 upload 返回同一素材；
  下载 SHA-256 一致，统一 `user_storage_files` 中只有一条 active / drive / asset 记录。
- 去掉签名读取对象为 403；未授权委托身份读取素材为 404；函数调用中伪造 `event.uid`
  未获得身份，返回 `UNAUTHENTICATED`。第二个真实登录账号的端到端切换仍需独立验收。
- 统一配额的 `reservedBytes=0`；对象字节记入统一用户存储，不另设 Saier 配额表。
  再次上传同一内容后，`usedBytes` 和 `reservedBytes` 均保持不变。
- Drive 旧资源详情预览入口的 `ast_` 素材适配已在 Drive 仓库补齐，并通过 owner、匿名、
  SVG 安全检查及旧资源回归测试；该兼容修复尚待代码发布。列表可见与此旧预览入口验收
  是两项独立检查，不能用前者替代后者。

回滚关闭 `SAIER_DRIVE_LIBRARY_ENABLED` 并撤销此次 Saier credential；保留已有对象与其他应用
权限。更新云函数 env 是全量替换，必须先读现有字段并合并，不能丢弃现有配置。
