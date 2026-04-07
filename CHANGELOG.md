# Changelog

> Temporary file — to be used as PR description, then deleted.

---

## Graceful shutdown of clusters

### Why

Previously there was no way to stop a `StandaloneInstance` without it immediately restarting every cluster. There were also no signal handlers in cluster child processes, so any SIGTERM/SIGINT would kill them abruptly without giving the Discord client a chance to clean up its connections.

Additionally, several unhandled-rejection crashes lurked in the IPC layer: if a child process died with a pending request in flight, `ERR_IPC_CHANNEL_CLOSED` would surface as an unhandled exception and take down the parent.

---

### Changes

#### `src/cluster/Cluster.ts`

- `onSelfDestruct` is now `() => void | Promise<void>` — async cleanup callbacks are properly awaited before the process exits.
- SIGTERM / SIGINT handlers registered in the constructor so that a direct OS signal triggers the same graceful path as a parent-initiated `SELF_DESTRUCT`.
- `SELF_DESTRUCT` request handler now returns a `Promise` to EventManager, meaning the response is only sent _after_ cleanup has finished (giving the parent time to receive it before the SIGKILL fallback fires).
- `_shuttingDown` flag prevents double-execution when both a propagated SIGINT and a `SELF_DESTRUCT` request arrive simultaneously (e.g. Ctrl+C in the terminal sending SIGINT to the whole process group).

#### `src/instance/BotInstance.ts`

- `protected _shuttingDown = false` flag shared with subclasses.
- `killProcess` returns `Promise<void>` (was `void`) so callers can await it.

#### `src/instance/StandaloneInstance.ts`

- `setClusterStopped` guards against restart when `_shuttingDown` is true.
- `public async shutdown(): Promise<void>` — sets the flag and awaits graceful kill of all clusters. Callers wire up SIGTERM/SIGINT themselves.

#### `src/general/EventManager.ts`

- `request`: `_send` failures are now propagated to the pending request instead of becoming unhandled rejections. Fixes `ERR_IPC_CHANNEL_CLOSED` crashes when `killProcess` is called on an already-dead child.
- `receive`: `_send` calls on the response path get `.catch(() => {})` — if the IPC channel closes between a request being handled and its response being sent, the error is silently swallowed. The parent handles the missing response via the existing 5 s timeout + SIGKILL fallback in `killProcess`.

#### Build / test infrastructure

- `tsx` added as a devDependency — test scripts now run TypeScript directly without a separate `tsc` compilation step.
- Test scripts updated to `npm run build && npx tsx test/...` so tests run against the tsdown-built bundle (`dist/index.cjs`) rather than a separate `tsc` output.
- `test:sa` script added for the standalone instance test.
- Test file imports changed from `"../src"` to `"../"` (resolves via `package.json` `main` to the built bundle).
- Child process entry points in `sa.machine.ts` and `machine.ts` updated to `bot.ts` with `['--import', 'tsx']` in `execArgv`.

#### `test/bot.ts`

- `cluster.onSelfDestruct` set to an async callback that destroys the Discord client and logs each step.

#### `test/sa.machine.ts`

- `gracefulShutdown()` wired to `SIGTERM`, `SIGINT`, and the `stop` stdin command — calls `machine.shutdown()` and exits after all clusters stop.

---

## Fix: out-of-order terminal output on graceful shutdown

### Why

After a graceful shutdown, child process log lines (e.g. `[Cluster N] Discord client destroyed`) appeared **after** the shell prompt had already returned. `killProcess()` resolved as soon as it received the SELF_DESTRUCT IPC response — but the child process had not yet exited at that point. The 500 ms `setTimeout` in the child was there to let the IPC response travel before dying, meaning the parent could call `process.exit(0)` while children were still alive. Because `stdio: 'inherit'` is used, their remaining stdout flushed directly to the terminal after the prompt.

### Changes

#### `src/instance/BotInstance.ts`

- `killProcess` now waits for the child's `exit` event after the SELF_DESTRUCT handshake (and SIGKILL fallback) before resolving. `machine.shutdown()` therefore only completes once every child process has fully terminated and flushed its stdout.

#### `src/cluster/Cluster.ts`

- Removed the 500 ms artificial delay before `process.exit(0)` in the SELF_DESTRUCT handler. It was only needed to give the IPC response time to reach the parent before the child died; since the parent now awaits actual process exit, the delay is no longer necessary.
