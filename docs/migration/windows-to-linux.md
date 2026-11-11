# Moving the bot from Windows to Linux

Readiness review of the audited system for the move described in the bot's own
`DEPLOYMENT.md`: an Ubuntu 24.04 VPS, Nginx in front, OpenWA alongside,
SQLite on disk.

The bot's deployment documentation is thorough and mostly correct. This
document lists what it does not cover, and what will fail on the first boot.

## What is already right

These were checked and do not need rework:

| Asset | State |
|---|---|
| `deploy/nginx/wa-booking-bot.conf` | complete and correct — TLS 1.2/1.3, HSTS, rate limits, proxy headers, `client_max_body_size` consistent with the app's own limit |
| `deploy/systemd/wa-booking-bot.service` | correct, needs `TZ` and `UMask` added |
| `deploy/systemd/openwa.service` | correct |
| `ecosystem.config.js` | correct — `instances: 1` and `exec_mode: 'fork'` are mandatory for SQLite and for a single WhatsApp session, and the file says so |
| `scripts/deploy/backup.sh` | correct — atomic `sqlite3 .backup` plus `integrity_check` |
| `scripts/deploy/deploy.sh` | correct — snapshot before deploy, then a 15-attempt `/ready` poll |
| `src/cairoTime.js` | correct — uses `Intl.DateTimeFormat` with an explicit `timeZone`, so it does not depend on the host clock |
| `src/env_path.js` | correct — the `.env` path is derived from `__dirname`, not the working directory |
| `src/receipt_extractor.js` | the Linux Tesseract branch already exists; it is not a gap |
| `src/openwa.js` | the Linux `pgrep` branch already exists |
| `better-sqlite3` | ships a `linux-x64` prebuilt binary; `npm ci` alone is enough, `npm rebuild` is unnecessary and slow |
| `test/helpers/tempdir.js` and the whole `test/` directory | portable — `os.tmpdir()` and `path.join` throughout |

## What blocks the first boot

### 1. The lock file carries a Windows PID — [P10](../../evidence/proofs/P10-stale-lock-pid-blocks-boot.md)

`data/bot.lock` contains `15968`, a PID from the Windows host. The startup
check is a bare `process.kill(pid, 0)`: if that number happens to be a live
process on the new host — and Linux recycles PIDs — the bot exits with code 2
and, under `Restart=always`, loops forever with a message that blames "another
instance running".

Delete `data/*.lock` before the first start, and change the check to verify
process identity rather than process liveness.

### 2. The repository is not committed

Fifty-four files under `src/` — including the whole `src/admin/` tree —
sixty-four test files, the `deploy/` directory and `scripts/deploy/` are
untracked. `git clone` on the server produces a tree that cannot boot.

There is also no configured remote, so the `git pull` in `deploy.sh` and the
`git checkout` in `rollback.sh` both fail silently.

### 3. The encryption key does not travel with the data

`src/secrets.js` derives its key from `ADMIN_SESSION_SECRET`, or failing
that from `data/.secret-key`. The current `.env` has no `ADMIN_SESSION_SECRET`,
so the live key is `data/.secret-key` — which is untracked and therefore not
copied.

Everything encrypted in the database becomes undecryptable without it:
`admin_pass`, `openwa_api_key`, `digitalcore_api_key`, `httpsms_api_key`,
`vodafone_password`, `webhook_secret`, `payment_accounts_secret`, and every
stored receipt image. The symptom is a bot that boots, refuses every login,
and fails every digital purchase.

Set `ADMIN_SESSION_SECRET` to the same value on both machines, or copy
`data/.secret-key` across. Setting it explicitly is better: it makes the key
recoverable from configuration rather than from a file nobody remembers.

### 4. `DATA_DIR` silently disables all outbound messages — [P09](../../evidence/proofs/P09-data-dir-triggers-mock-sends.js)

`openwa.isTestEnvironment` treats any `DATA_DIR` other than `<repo>/data` as a
test environment, and in that mode every `sendText` and `reply` returns a
mock without touching the gateway. `DEPLOYMENT.md` specifies
`DATA_DIR=/opt/wa-booking-bot/data`.

Move the bot exactly as documented and it starts, receives, records, and replies
to nobody — with no error in any log. `followups.isTestEnvironment` has the
same shape: it disables scheduled follow-ups when the path contains the
substring `wa-booking-`.

### 5. The webhook URL is built from the bind address

`scripts/register-webhook.js` derives the registered callback URL from
`config.host`. With `HOST=127.0.0.1` that registers
`http://127.0.0.1:3000/webhook`. If OpenWA runs in Docker with the port
published on the host, its loopback is the container's, not the host's, and no
WhatsApp message ever arrives.

Run OpenWA natively on the same host, or add an explicit
`WEBHOOK_PUBLIC_URL` setting and use it when registering.

## What fails after the first boot

| # | Issue | Where | Fix |
|---|---|---|---|
| 6 | `spawn('python', …)` — Ubuntu has `python3`, not `python` | `src/audio_transcriber.js` | `process.env.PYTHON_BIN \|\| 'python3'` |
| 7 | `requirements.txt` is never installed by `setup-vps.sh` | `scripts/deploy/setup-vps.sh` | `pip3 install -r requirements.txt`, in a venv |
| 8 | `tesseract-ocr-eng` is not installed explicitly | `scripts/deploy/setup-vps.sh` | add it; the setup script installs `ara` only |
| 9 | `postrotate` sends `SIGUSR1`, which the app does not handle — the default Linux behaviour is to terminate | `deploy/logrotate/wa-booking-bot` | remove the `postrotate` block, or add a `SIGUSR1` handler that reopens the log files |
| 10 | The systemd unit runs `src/server.js` directly, so the supervisor's health check and backoff never run | `deploy/systemd/wa-booking-bot.service` | run `scripts/supervisor.js` from the unit, or move the health check into systemd (`Restart=always`, `WatchdogSec=60`) |
| 11 | `cleanPort()` uses `netstat`/`taskkill`, which do not exist on Linux, inside an empty `catch` | `scripts/supervisor.js` | `lsof -ti:3000 \| xargs -r kill`, or drop it and let systemd own the port |
| 12 | `npm ci --omit=dev` is used for the dashboard, whose build needs `vite` and `tailwindcss` from `devDependencies` — the failure is swallowed by `\|\| log_warn` | `scripts/deploy/deploy.sh` | use plain `npm ci` for the dashboard, or drop the step — `public/dashboard` is tracked |
| 13 | `sudo systemctl restart` inside scripts that are documented to run as `botuser` | `deploy.sh`, `restore.sh`, `rollback.sh` | run them as root, or add a sudoers rule |
| 14 | `playwright-core` is required by `src/we_api.js` but is not in `dependencies` at all | `src/we_api.js`, `package.json` | [P08](../../evidence/proofs/P08-undeclared-production-dependency.md) |
| 15 | The pre-deploy snapshot `bot-pre-deploy-*.db` does not match the retention pattern, so it grows without bound | `src/server.js` | widen the pattern or move pre-deploy snapshots out of `data/backups` |
| 16 | `trust proxy` is hard-coded to `loopback` — behind a proxy on another host, every request appears to come from `127.0.0.1` and the per-IP webhook limit becomes a global limit | `src/server.js` | make it configurable |
| 17 | `mmap_size` 256 MB + a 32 MB cache against a ~120 MB database puts RSS above 600 MB; PM2's `max_memory_restart: '600M'` and systemd's `MemoryMax=1G` will both kill it | `src/store.js`, `ecosystem.config.js` | raise the limits or lower `mmap_size` |
| 18 | `OPERATIONS.md` points at `/opt/wa-booking-bot/logs/` and `/opt/wa-booking-bot/backups/`; the code writes to `data/logs/` and `data/backups/` | `OPERATIONS.md` | correct the paths |
| 19 | The backup script writes only the database; the documentation promises a tarball including receipts, with a SHA-256 | `scripts/deploy/backup.sh`, `BACKUP_AND_RESTORE.md` | reconcile the two |

## Data transfer

Not covered by any script in the repository. In order:

1. `data/bot.db` — use `sqlite3 .backup`, not `cp`. A raw copy of a WAL-mode
   database while it is live will not be consistent.
2. `data/receipts/` — encrypted with AES-256-GCM under the same key. They are
   unreadable without it.
3. `data/invoices/`, `data/packages.json`.
4. `data/.secret-key`, or an identical `ADMIN_SESSION_SECRET` in `.env`.
5. The OpenWA session directory. It lives outside this repository, and without
   it the WhatsApp session has to be re-established by scanning a QR code.
6. Delete `data/bot.lock` and `data/supervisor.lock`.

## Suggested order

Follow [decision 0004](../decisions/0004-remediation-order.md). In short:

1. Make the bot boot on the target host — P10, the untracked files, the
   encryption key, the `DATA_DIR` heuristic, the webhook URL.
2. Make the deployment match the documentation — items 6 through 19 above.
3. Fix the money path — P01, P04, P06, P05, P11.
4. Close the environment fail-open conditions — P03, P09.
5. Repair the dead paths — P02, P07.
6. Only then restructure.

After every step, re-run P12. It is the only check in the repository that
notices when a change to the payment path breaks a guarantee that currently
holds.
