import antfu from '@antfu/eslint-config'

export default antfu(
  {
    unocss: true,
    formatters: true,
    ignores: [
      'apps/mobile/www/**',
    ],
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
  {
    files: ['packages/collaboration/**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['saier', 'saier/*', '@saier/pixi', '@saier/pixi/*', '../../site/*', '../../../site/*'],
            message: 'Activity contracts must not depend on Painter, Pixi, or site implementation modules.',
          },
        ],
      }],
    },
  },
)
