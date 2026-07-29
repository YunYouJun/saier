# Local SSO development

Saier uses one canonical local Web origin:

```text
https://saier.yunle.localhost:3452
```

Install Caddy, then start the site and HTTPS gateway from the repository root:

```bash
pnpm dev:site:sso
```

On first use, keep that process running and trust Caddy's local development CA
from another terminal:

```bash
pnpm dev:site:sso:trust
```

Open <https://saier.yunle.localhost:3452>. The launcher proxies to an available
loopback Nuxt port and defaults to the isolated YunLeFun development CloudBase
tenant, `https://www.yunle.localhost:3000` Provider, and its
`/api/sso-ticket` exchange adapter. Explicit environment variables take
precedence.

The Provider registry binds `saier-web` to this exact origin and the
`https://saier.yunle.localhost:3452/` redirect URI. Start the Provider with
`pnpm dev:sso` in the www repository. Production never accepts this callback.

The ordinary `pnpm dev` command remains available at `http://localhost:8080`
for painting work that does not require unified login.
