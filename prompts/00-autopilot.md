# Autopilot: build and deploy Torob-yar end to end, with no questions

You are running **fully autonomously**. I'm not watching and I will not answer questions. Don't ask me anything, don't wait for confirmation, and don't stop to report progress mid-way. Keep working until the definition of done in Prompt 2 is met, or until every remaining item is logged as Blocked.

## Order of work
1. Read `CLAUDE.md` (autonomous working agreement), then `docs/UI_SPEC.md`, `docs/DATA.md`, `docs/vendor/*`.
2. If `docs/PROGRESS.md` exists, you're resuming: read it, plus `docs/DECISIONS.md` and `git log --oneline -20`, and continue from where it left off. Don't redo finished milestones.
3. Execute **`prompts/01-build-app.md`** fully (M0 → M10). Commit after every milestone.
4. Then execute **`prompts/02-deploy-liara.md`** fully. Commit after every step.
5. Then do a final polish pass with the remaining time: open the live site at both sizes and fix the 5 most visible UX issues you can find. For each fix, redeploy, re-run smoke, and commit.
6. Write the final report at the top of `docs/PROGRESS.md` and commit it.

## How to decide without me
- **Priority order:** a working live demo > UX quality (UI_SPEC) > intelligence features > technical polish.
- When the spec is ambiguous, pick the option a judge would find clearer and smoother on a phone.
- When something external fails (BoxAPI, Liara, map tiles), use the documented fallback (scripted LLM mode, fixtures, fallback map style), log it, and move on. Never let one failure block the rest.
- Never spend more than ~45 minutes stuck on one problem. Take the fallback, log it under "Blocked / follow-ups", continue.
- Log every non-trivial decision in `docs/DECISIONS.md`: date, decision, why, how to undo.

## Hard limits (even in autonomous mode)
- Never commit secrets, `.env*.local`, or `data/raw`. Never force-push or rewrite git history.
- Never delete Liara apps, disks or networks. Never buy anything beyond the plan named in Prompt 2.
- Never run destructive commands outside this repo folder.

## Context management
`docs/PROGRESS.md` is your memory. Update it after every milestone (done / next / decisions / blocked). After a context compaction, re-read it before doing anything else.
