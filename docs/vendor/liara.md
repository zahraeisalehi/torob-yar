# Liara (liara.ir): deployment notes

Iranian PaaS with a CLI: `npm install -g @liara/cli`, then `liara login`.
**Always explore commands with `liara --help` / `liara <cmd> --help`.** Don't assume flags from memory.

## Verified on another project (2026-10-22). Re-check flags with --help
- **A private network is required before `app create`:** `liara network create -n <net>`, then `app create ... -n <net>`.
- `app create` needs a feature bundle. API ids are `free | standard | pro`; the interactive prompt labels them differently. Example plan: `standard-base-g2`.
- Non-interactive create example: `liara app create -a <name> --platform docker --plan standard-base-g2 --feature-plan standard -n <net> -r false`
- **Platform `docker`** with the repo's `Dockerfile` worked. The config file `liara.json` sets the port and disks, e.g. disk `data` → mount path.
- Build location `iran` was used (user choice).
- Env vars are set via Liara (`liara env ...`), never in the image or repo.
- Logs go to stdout. Liara restarts the app on crash, so the app must be safe to restart.

## Rules for Claude Code
- `liara app create`, `liara deploy`, `liara disk create` and `liara env` changes **require the user's explicit confirmation**. Print the exact command and wait.
- After each deploy: check logs, hit `/api/health`, open the live URL on mobile and desktop widths.
