import antfu from '@antfu/eslint-config'

export default antfu(
  {
    unocss: true,
    formatters: true,
  },
  {
    rules: {
      // The monorepo isn't fully on pnpm catalogs yet (only `docs` is).
      // Don't force every plain version into a catalog — that would block
      // commits mid-migration. `json-valid-catalog` still validates the
      // catalog refs that do exist. Re-enable after a deliberate migration.
      'pnpm/json-enforce-catalog': 'off',
    },
  },
)
