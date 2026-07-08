export const YUNLEFUN_TEST_ACCOUNT_PREFIX = 'ylf_test_'
export const YUNLEFUN_TEST_ACCOUNT_SCHEMA = 'yunlefun.test-account.v1'
export const YUNLEFUN_TEST_ACCOUNT_NAMESPACE = 'saier'

export type YunlefunTestAccountSlot = 'owner' | 'editor' | 'viewer' | 'member'

export interface YunlefunTestAccountFixture {
  readonly slot: YunlefunTestAccountSlot
  readonly username: `${typeof YUNLEFUN_TEST_ACCOUNT_PREFIX}${string}`
  readonly displayName: string
  readonly envUsername: string
  readonly envPassword: string
  readonly member: boolean
  readonly purpose: readonly string[]
}

export interface YunlefunTestAccountMarker {
  readonly schema: typeof YUNLEFUN_TEST_ACCOUNT_SCHEMA
  readonly isTestAccount: true
  readonly namespace: typeof YUNLEFUN_TEST_ACCOUNT_NAMESPACE
  readonly usernamePrefix: typeof YUNLEFUN_TEST_ACCOUNT_PREFIX
  readonly slot: YunlefunTestAccountSlot
  readonly owner: 'saier'
  readonly resetPolicy: 'delete-owned-test-data'
  readonly purpose: readonly string[]
}

export const YUNLEFUN_TEST_ACCOUNT_FIXTURES: readonly YunlefunTestAccountFixture[] = [
  {
    slot: 'owner',
    username: 'ylf_test_saier_owner',
    displayName: 'YunLeFun Test Saier Owner',
    envUsername: 'SAIER_E2E_YUNLEFUN_OWNER_USERNAME',
    envPassword: 'SAIER_E2E_YUNLEFUN_OWNER_PASSWORD',
    member: false,
    purpose: ['saier-cloud-room-owner', 'saier-cloud-storage-normal'],
  },
  {
    slot: 'editor',
    username: 'ylf_test_saier_editor',
    displayName: 'YunLeFun Test Saier Editor',
    envUsername: 'SAIER_E2E_YUNLEFUN_EDITOR_USERNAME',
    envPassword: 'SAIER_E2E_YUNLEFUN_EDITOR_PASSWORD',
    member: false,
    purpose: ['saier-cloud-room-editor'],
  },
  {
    slot: 'viewer',
    username: 'ylf_test_saier_viewer',
    displayName: 'YunLeFun Test Saier Viewer',
    envUsername: 'SAIER_E2E_YUNLEFUN_VIEWER_USERNAME',
    envPassword: 'SAIER_E2E_YUNLEFUN_VIEWER_PASSWORD',
    member: false,
    purpose: ['saier-cloud-room-viewer'],
  },
  {
    slot: 'member',
    username: 'ylf_test_saier_member',
    displayName: 'YunLeFun Test Saier Member',
    envUsername: 'SAIER_E2E_YUNLEFUN_MEMBER_USERNAME',
    envPassword: 'SAIER_E2E_YUNLEFUN_MEMBER_PASSWORD',
    member: true,
    purpose: ['saier-cloud-storage-member-quota'],
  },
]

export function isYunlefunTestAccountUsername(username: string): boolean {
  return username.startsWith(YUNLEFUN_TEST_ACCOUNT_PREFIX)
}

export function getYunlefunTestAccountFixture(slot: YunlefunTestAccountSlot): YunlefunTestAccountFixture {
  const fixture = YUNLEFUN_TEST_ACCOUNT_FIXTURES.find(item => item.slot === slot)
  if (!fixture)
    throw new Error(`Unknown YunLeFun test account slot: ${slot}`)

  return fixture
}

export function createYunlefunTestAccountMarker(slot: YunlefunTestAccountSlot): YunlefunTestAccountMarker {
  const fixture = getYunlefunTestAccountFixture(slot)

  return {
    schema: YUNLEFUN_TEST_ACCOUNT_SCHEMA,
    isTestAccount: true,
    namespace: YUNLEFUN_TEST_ACCOUNT_NAMESPACE,
    usernamePrefix: YUNLEFUN_TEST_ACCOUNT_PREFIX,
    slot,
    owner: 'saier',
    resetPolicy: 'delete-owned-test-data',
    purpose: fixture.purpose,
  }
}

export function getYunlefunTestAccountCredentials(
  slot: YunlefunTestAccountSlot,
  env: Record<string, string | undefined>,
): { password: string, username: string } | undefined {
  const fixture = getYunlefunTestAccountFixture(slot)
  const username = env[fixture.envUsername]?.trim()
  const password = env[fixture.envPassword]?.trim()

  if (!username || !password)
    return undefined

  if (!isYunlefunTestAccountUsername(username))
    throw new Error(`${fixture.envUsername} must start with ${YUNLEFUN_TEST_ACCOUNT_PREFIX}`)

  return { password, username }
}

export function listMissingYunlefunTestAccountEnv(env: Record<string, string | undefined>): string[] {
  return YUNLEFUN_TEST_ACCOUNT_FIXTURES.flatMap((fixture) => {
    const missing: string[] = []
    if (!env[fixture.envUsername]?.trim())
      missing.push(fixture.envUsername)
    if (!env[fixture.envPassword]?.trim())
      missing.push(fixture.envPassword)
    return missing
  })
}
