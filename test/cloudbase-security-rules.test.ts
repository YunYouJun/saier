import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const maxRuleExpressionLength = 1024
const maxCloudFileBytes = 200 * 1024 * 1024
const maxAvatarBytes = 10 * 1024 * 1024

interface SecurityRule {
  create?: boolean | string
  delete?: boolean | string
  read?: boolean | string
  update?: boolean | string
  write?: boolean | string
}

function readRule(path: string): SecurityRule {
  return JSON.parse(readFileSync(resolve(rootDir, path), 'utf8')) as SecurityRule
}

function expectExpressionLengthsWithinLimit(rule: SecurityRule): void {
  for (const expression of Object.values(rule)) {
    if (typeof expression === 'string')
      expect(expression.length).toBeLessThanOrEqual(maxRuleExpressionLength)
  }
}

describe('cloudbase security rules', () => {
  it('keeps YunLeFun membership read-only for clients', () => {
    const rule = readRule('cloudbase/security-rules/no-sql/user_memberships.json')

    expect(rule.read).toContain('doc._id == auth.uid')
    expect(rule.read).toContain('doc.userId == auth.uid')
    expect(rule.create).toBe(false)
    expect(rule.update).toBe(false)
    expect(rule.delete).toBe(false)
    expectExpressionLengthsWithinLimit(rule)
  })

  it('keeps legacy Saier file metadata owner-readable but backend-created', () => {
    const rule = readRule('cloudbase/security-rules/no-sql/saier_cloud_files.json')

    expect(rule.read).toContain('doc.app == \'saier\'')
    expect(rule.read).toContain('doc.userId == auth.uid')
    expect(rule.create).toBe(false)
    expect(rule.update).toBe(false)
    expect(rule.delete).toContain('doc.app == \'saier\'')
    expect(rule.delete).toContain('doc.userId == auth.uid')
    expectExpressionLengthsWithinLimit(rule)
  })

  it('keeps global storage indexes read-only for clients', () => {
    const quotaRule = readRule('cloudbase/security-rules/no-sql/user_storage_quotas.json')
    const fileRule = readRule('cloudbase/security-rules/no-sql/user_storage_files.json')

    for (const rule of [quotaRule, fileRule]) {
      expect(rule.read).toContain('doc.userId == auth.uid')
      expect(rule.create).toBe(false)
      expect(rule.update).toBe(false)
      expect(rule.delete).toBe(false)
      expectExpressionLengthsWithinLimit(rule)
    }
  })

  it('allows owned avatars, reserved user storage writes, and legacy Saier project storage only', () => {
    const rule = readRule('cloudbase/security-rules/storage/saier-projects.json')

    expect(rule.read).toContain('resource.openid == auth.uid')
    expect(rule.read).toContain('resource.openid == auth.openid')
    expect(rule.read).toContain('/^avatars\\//.test(resource.path)')
    expect(rule.read).toContain('/user-storage\\//.test(resource.path)')
    expect(rule.read).toContain('/\\.saier\\.project\\.json$/.test(resource.path)')
    expect(rule.read).toContain('/brush-library\\.saier\\.brushes\\.json$/.test(resource.path)')
    expect(rule.read).toContain('/^saier\\/projects\\//.test(resource.path)')
    expect(rule.read).toContain('/\\.saier\\.project\\.json$/.test(resource.path)')
    expect(rule.write).toContain('resource.openid == auth.uid')
    expect(rule.write).toContain('resource.openid == auth.openid')
    expect(rule.write).toContain('/user-storage\\//.test(resource.path)')
    expect(rule.write).toContain('/\\.saier\\.project\\.json$/.test(resource.path)')
    expect(rule.write).toContain('/brush-library\\.saier\\.brushes\\.json$/.test(resource.path)')
    expect(rule.write).toContain(`resource.size <= ${maxAvatarBytes}`)
    expect(rule.write).toContain(`resource.size <= ${maxCloudFileBytes}`)
    expect(rule.write).toContain('/^avatars\\//.test(resource.path)')
    expect(rule.write).toContain('/^saier\\/projects\\//.test(resource.path)')
    expectExpressionLengthsWithinLimit(rule)
  })

  it('documents brush libraries as shared storage business files', () => {
    const readme = readFileSync(resolve(rootDir, 'cloudbase/security-rules/README.md'), 'utf8')

    expect(readme).toContain('user-storage-api')
    expect(readme).toContain('reserveStorageUpload')
    expect(readme).toContain('finalizeStorageUpload')
    expect(readme).toContain('listStorageFiles({ appId: \'saier\', kind: \'brush-library\', slotKey: \'default\', limit: 1 })')
    expect(readme).toContain('kind: \'brush-library\'')
    expect(readme).toContain('slotKey: \'default\'')
    expect(readme).toContain('256 KiB')
    expect(readme).toContain('shared storage')
    expect(readme).toContain('must not parse `saier.brush-library.v1`')
  })
})
