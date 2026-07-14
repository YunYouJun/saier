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

  it('keeps Saier room collaboration collections private to saier-room-api', () => {
    const paths = [
      'cloudbase/security-rules/no-sql/saier_room_members.json',
      'cloudbase/security-rules/no-sql/saier_room_operations.json',
      'cloudbase/security-rules/no-sql/saier_room_rooms.json',
      'cloudbase/security-rules/no-sql/saier_room_snapshot_reservations.json',
      'cloudbase/security-rules/no-sql/saier_room_snapshots.json',
      'cloudbase/security-rules/no-sql/saier_room_game_sessions.json',
      'cloudbase/security-rules/no-sql/saier_room_game_secrets.json',
      'cloudbase/security-rules/no-sql/saier_room_game_events.json',
      'cloudbase/security-rules/no-sql/saier_room_game_commands.json',
      'cloudbase/security-rules/no-sql/saier_room_game_outbox.json',
      'cloudbase/security-rules/no-sql/saier_room_game_canvas_operations.json',
      'cloudbase/security-rules/no-sql/saier_room_game_snapshots.json',
    ]

    for (const path of paths) {
      const rule = readRule(path)
      expect(rule.read).toBe(false)
      expect(rule.create).toBe(false)
      expect(rule.update).toBe(false)
      expect(rule.delete).toBe(false)
      expectExpressionLengthsWithinLimit(rule)
    }
  })

  it('keeps YunLeFun test account registry private to backend tooling', () => {
    const rule = readRule('cloudbase/security-rules/no-sql/yunlefun_test_accounts.json')

    expect(rule.read).toBe(false)
    expect(rule.create).toBe(false)
    expect(rule.update).toBe(false)
    expect(rule.delete).toBe(false)
    expectExpressionLengthsWithinLimit(rule)
  })

  it('allows owned avatars, reserved user storage writes, and legacy Saier project storage only', () => {
    const rule = readRule('cloudbase/security-rules/storage/saier-projects.json')

    expect(rule.read).toContain('resource.openid == auth.uid')
    expect(rule.read).toContain('resource.openid == auth.openid')
    expect(rule.read).toContain('/^avatars\\//.test(resource.path)')
    expect(rule.read).toContain('/user-storage\\//.test(resource.path)')
    expect(rule.read).toContain('/room-storage\\/saier\\//.test(resource.path)')
    expect(rule.read).toContain('/\\.saier\\.project\\.json$/.test(resource.path)')
    expect(rule.read).toContain('/brush-library\\.saier\\.brushes\\.json$/.test(resource.path)')
    expect(rule.read).toContain('/\\.saier\\.room-snapshot\\.json$/.test(resource.path)')
    expect(rule.read).toContain('/^saier\\/projects\\//.test(resource.path)')
    expect(rule.read).toContain('/\\.saier\\.project\\.json$/.test(resource.path)')
    expect(rule.write).toContain('resource.openid == auth.uid')
    expect(rule.write).toContain('resource.openid == auth.openid')
    expect(rule.write).toContain('/user-storage\\//.test(resource.path)')
    expect(rule.write).toContain('/room-storage\\/saier\\//.test(resource.path)')
    expect(rule.write).toContain('/\\.saier\\.project\\.json$/.test(resource.path)')
    expect(rule.write).toContain('/brush-library\\.saier\\.brushes\\.json$/.test(resource.path)')
    expect(rule.write).toContain('/\\.saier\\.room-snapshot\\.json$/.test(resource.path)')
    expect(rule.write).toContain(`resource.size <= ${maxAvatarBytes}`)
    expect(rule.write).toContain(`resource.size <= ${maxCloudFileBytes}`)
    expect(rule.write).toContain('/^avatars\\//.test(resource.path)')
    expect(rule.write).toContain('/^saier\\/projects\\//.test(resource.path)')
    expect(rule.read).toContain('/room-storage\\/saier\\//.test(resource.path) == true')
    expect(rule.write).toContain('/room-storage\\/saier\\//.test(resource.path) == true')
    expect(rule.read).not.toContain('.indexOf(')
    expect(rule.write).not.toContain('.indexOf(')
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
    expect(readme).toContain('saier-room-api')
    expect(readme).toContain('saier_room_operations')
    expect(readme).toContain('yunlefun_test_accounts')
  })
})
