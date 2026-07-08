import { describe, expect, it } from 'vitest'
import {
  createYunlefunTestAccountMarker,
  getYunlefunTestAccountCredentials,
  isYunlefunTestAccountUsername,
  listMissingYunlefunTestAccountEnv,
  YUNLEFUN_TEST_ACCOUNT_FIXTURES,
  YUNLEFUN_TEST_ACCOUNT_PREFIX,
  YUNLEFUN_TEST_ACCOUNT_SCHEMA,
} from '../e2e/fixtures/yunlefun-test-accounts'

describe('yunLeFun test account fixtures', () => {
  it('uses one fixed username prefix for every formal test account', () => {
    expect(YUNLEFUN_TEST_ACCOUNT_PREFIX).toBe('ylf_test_')
    expect(YUNLEFUN_TEST_ACCOUNT_FIXTURES).toHaveLength(4)
    expect(new Set(YUNLEFUN_TEST_ACCOUNT_FIXTURES.map(item => item.slot)).size).toBe(YUNLEFUN_TEST_ACCOUNT_FIXTURES.length)
    expect(new Set(YUNLEFUN_TEST_ACCOUNT_FIXTURES.map(item => item.username)).size).toBe(YUNLEFUN_TEST_ACCOUNT_FIXTURES.length)

    for (const fixture of YUNLEFUN_TEST_ACCOUNT_FIXTURES) {
      expect(isYunlefunTestAccountUsername(fixture.username)).toBe(true)
      expect(fixture.envUsername).toMatch(/^SAIER_E2E_YUNLEFUN_[A-Z]+_USERNAME$/)
      expect(fixture.envPassword).toMatch(/^SAIER_E2E_YUNLEFUN_[A-Z]+_PASSWORD$/)
      expect(fixture.purpose.length).toBeGreaterThan(0)
    }
  })

  it('creates a stable marker for backend registry and profile metadata', () => {
    const marker = createYunlefunTestAccountMarker('owner')

    expect(marker).toEqual({
      schema: YUNLEFUN_TEST_ACCOUNT_SCHEMA,
      isTestAccount: true,
      namespace: 'saier',
      usernamePrefix: YUNLEFUN_TEST_ACCOUNT_PREFIX,
      slot: 'owner',
      owner: 'saier',
      resetPolicy: 'delete-owned-test-data',
      purpose: ['saier-cloud-room-owner', 'saier-cloud-storage-normal'],
    })
  })

  it('loads credentials from env without allowing non-test usernames', () => {
    expect(getYunlefunTestAccountCredentials('owner', {
      SAIER_E2E_YUNLEFUN_OWNER_USERNAME: 'ylf_test_saier_owner',
      SAIER_E2E_YUNLEFUN_OWNER_PASSWORD: 'secret',
    })).toEqual({
      username: 'ylf_test_saier_owner',
      password: 'secret',
    })

    expect(() => getYunlefunTestAccountCredentials('owner', {
      SAIER_E2E_YUNLEFUN_OWNER_USERNAME: 'real_user',
      SAIER_E2E_YUNLEFUN_OWNER_PASSWORD: 'secret',
    })).toThrow('must start with ylf_test_')
  })

  it('reports every missing credential variable for gated browser smoke', () => {
    expect(listMissingYunlefunTestAccountEnv({})).toEqual(YUNLEFUN_TEST_ACCOUNT_FIXTURES.flatMap(fixture => [
      fixture.envUsername,
      fixture.envPassword,
    ]))
  })
})
