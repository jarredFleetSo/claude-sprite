# Phase 1: Shell + Dashboard - Validation

**Created:** 2026-03-19
**Source:** 01-RESEARCH.md Validation Architecture section

---

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (bundled with electron-vite template) |
| Config file | `vitest.config.ts` (Wave 0 creates this) |
| Quick run command | `pnpm test --run` |
| Full suite command | `pnpm test` |

Note: electron-vite's React TypeScript template includes Vitest by default. Main process code and React components can both be tested with Vitest. No separate Jest setup needed.

---

## Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHELL-01 | Electron app launches | smoke | manual: `pnpm dev` and observe window | N/A |
| SHELL-02 | Setup wizard collects credentials | unit | `pnpm test --run src/renderer/src/routes/SetupWizard.test.tsx` | Wave 0 |
| SHELL-03 | Config persists + auto-imports cs config | unit | `pnpm test --run src/main/config-store.test.ts` | Wave 0 |
| SHELL-04 | contextBridge API shape | unit | `pnpm test --run src/preload/index.test.ts` | Wave 0 |
| SHELL-05 | PATH resolution | manual | Launch packaged .app from Finder, verify sprite exec works | N/A (packaging phase) |
| DASH-01 | Sprite list renders with status badges | unit | `pnpm test --run src/renderer/src/components/SpriteCard.test.tsx` | Wave 0 |
| DASH-02 | Start action triggers correct CLI args | unit | `pnpm test --run src/main/ipc/sprites.test.ts` | Wave 0 |
| DASH-03 | Stop action triggers correct CLI args | unit | `pnpm test --run src/main/ipc/sprites.test.ts` | Wave 0 |
| DASH-04 | Destroy requires type-to-confirm | unit | `pnpm test --run src/renderer/src/components/modals/DestroyConfirmModal.test.tsx` | Wave 0 |
| DASH-05 | Create triggers sprite create --skip-console | unit | `pnpm test --run src/main/ipc/sprites.test.ts` | Wave 0 |
| DASH-06 | Quick-action buttons render per card | unit | `pnpm test --run src/renderer/src/components/SpriteCard.test.tsx` | Wave 0 |
| DASH-07 | Polling refetches at interval | unit | `pnpm test --run src/renderer/src/hooks/useSprites.test.ts` | Wave 0 |

---

## Sampling Rate

- **Per task commit:** `pnpm test --run` (single-pass, no watch)
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

---

## Wave 0 Test Stubs

These files are created by Plan 01-00 (Wave 0) before any implementation plans run:

| Test File | Covers | Requirements |
|-----------|--------|--------------|
| `src/main/ipc/sprites.test.ts` | Lifecycle CLI args (start/stop/destroy/create) | DASH-02, DASH-03, DASH-05 |
| `src/main/config-store.test.ts` | Config auto-import and persistence | SHELL-03 |
| `src/preload/index.test.ts` | contextBridge API surface shape | SHELL-04 |
| `src/renderer/src/routes/SetupWizard.test.tsx` | Wizard step flow and config save | SHELL-02 |
| `src/renderer/src/components/SpriteCard.test.tsx` | Card rendering, status badges, action buttons | DASH-01, DASH-06 |
| `src/renderer/src/components/modals/DestroyConfirmModal.test.tsx` | Type-to-confirm guard | DASH-04 |
| `src/renderer/src/hooks/useSprites.test.ts` | Polling interval configuration | DASH-07 |

---

*Phase: 01-shell-dashboard*
*Validation architecture: 2026-03-19*
