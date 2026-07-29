import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const gateway = readFileSync(new URL('../dev/Caddyfile', import.meta.url), 'utf8')
const launcher = readFileSync(new URL('../scripts/dev-site-sso.mjs', import.meta.url), 'utf8')

describe('local SSO development entrypoint', () => {
  it('starts Saier behind its registered HTTPS origin', () => {
    expect(packageJson.scripts['dev:site:sso']).toBe('node scripts/dev-site-sso.mjs')
    expect(packageJson.scripts['dev:site:sso:trust']).toBe('caddy trust --address 127.0.0.1:2032')
    expect(launcher).toContain('const appOrigin = \'https://saier.yunle.localhost:3452\'')
    expect(launcher).toContain('NUXT_PUBLIC_YUNLEFUN_SSO_CLIENT_ID: \'saier-web\'')
    expect(launcher).toMatch(/NUXT_PUBLIC_YUNLEFUN_SSO_REDIRECT_URI: `\$\{appOrigin\}\/`/)
    expect(gateway).toContain('https://saier.yunle.localhost:3452')
    expect(gateway).toContain('reverse_proxy {$YUNLE_SAIER_UPSTREAM:127.0.0.1:8080}')
  })

  it('uses the isolated development identity tenant by default', () => {
    expect(launcher).toContain('const developmentCloudbaseEnv = \'yunlefun-dev-0ge03bdod37093d1\'')
    expect(launcher).toContain('const developmentSsoOrigin = \'https://www.yunle.localhost:3000\'')
    expect(launcher).toContain('NUXT_PUBLIC_YUNLEFUN_CLOUDBASE_ENV: process.env.NUXT_PUBLIC_YUNLEFUN_CLOUDBASE_ENV ?? developmentCloudbaseEnv')
    expect(launcher).toContain('NUXT_PUBLIC_YUNLEFUN_SSO_ORIGIN: process.env.NUXT_PUBLIC_YUNLEFUN_SSO_ORIGIN ?? developmentSsoOrigin')
    expect(launcher).toContain('NUXT_PUBLIC_YUNLEFUN_SSO_EXCHANGE_URL: process.env.NUXT_PUBLIC_YUNLEFUN_SSO_EXCHANGE_URL ?? developmentSsoExchangeUrl')
  })
})
