# Phase 2: Dispatch + File Sync - Validation

## Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^3.1.1 |
| Config file | `claude-sprite-desktop/vitest.config.ts` |
| Quick run | `cd claude-sprite-desktop && npx vitest run` |
| Full suite | `cd claude-sprite-desktop && npx vitest run` |

## Requirements to Test Map

| Req ID | Behavior | Test Type | Test File | Plan |
|--------|----------|-----------|-----------|------|
| DISP-01 | dispatch IPC handler fires cs dispatch CLI with positional args | unit | `src/main/ipc/dispatch.test.ts` | 02-01 |
| DISP-02 | streaming log lines forwarded to renderer via per-sprite channel | unit | `src/main/ipc/dispatch.test.ts` | 02-01 |
| DISP-03 | abort kills local process and calls cs abort | unit | `src/main/ipc/dispatch.test.ts` | 02-01 |
| DISP-04 | Notification.show() called on DISPATCH_DONE detection | unit | `src/main/ipc/dispatch.test.ts` | 02-01 |
| SYNC-01 | sync:push IPC handler fires cs sync with progress | unit | `src/main/ipc/sync.test.ts` | 02-01 |
| SYNC-02 | sync:pull IPC handler fires cs context pull | unit | `src/main/ipc/sync.test.ts` | 02-01 |
| SYNC-03 | auto-sync flag respected in dispatch handler | unit | `src/main/ipc/dispatch.test.ts` | 02-01 |
| DISP-01 | useDispatch hook calls dispatch(sprite, prompt, noSync) — no org | unit | `src/renderer/src/hooks/useDispatch.test.ts` | 02-02 |
| DISP-02 | useDispatch accumulates log lines, capped at 2000 | unit | `src/renderer/src/hooks/useDispatch.test.ts` | 02-02 |
| DISP-03 | useDispatch abort calls abortDispatch(sprite) — no org | unit | `src/renderer/src/hooks/useDispatch.test.ts` | 02-02 |

## Renderer Hook Tests (useDispatch)

File: `claude-sprite-desktop/src/renderer/src/hooks/useDispatch.test.ts`
Plan: 02-02, Task 1
Environment: jsdom

| Test | Behavior |
|------|----------|
| Initial state | status='idle', logs=[], exitCode=null |
| Launch sets launching | After launch(prompt), status becomes 'launching' |
| Log line transitions to running | onDispatchLog fires -> status 'launching' -> 'running', line appended |
| Log cap at 2000 | After 2100 lines, only last 2000 retained |
| Done sets done/failed | onDispatchDone {success:true} -> 'done'; {success:false} -> 'failed' |
| Abort sets aborted | abort() calls abortDispatch(spriteName), status -> 'aborted' |
| Reset returns to idle | reset() -> status='idle', logs=[] |
| Failed launch | dispatch returns {started:false} -> status='failed' |

## Sampling Rate

- **Per task:** `cd claude-sprite-desktop && npx vitest run`
- **Per plan:** `cd claude-sprite-desktop && npx vitest run && pnpm build`
- **Phase gate:** Full suite green + human verification (Plan 03 Task 3)

## Manual Verification (Plan 03 Task 3)

| Step | Expected |
|------|----------|
| Running sprite shows Push/Pull buttons | Upload/Download icons visible on card |
| Click Push | Progress indicator with spinner, then "Done" |
| Click Dispatch on sprite | DispatchPanel modal opens |
| Type prompt, click Dispatch | Status: Launching -> Running, logs stream |
| Click Abort while running | Status: Aborted, remote stopped |
| Dispatch completes | OS notification fires, status: Complete |
| Toggle auto-sync, restart | Setting persists |
