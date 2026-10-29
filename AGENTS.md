# Working protocol (two-account handoff)

Another AI assistant (Claude, ChatGPT/Codex, etc.) may take over at any time; you can be cut off mid-task.

1. START of session: read HANDOFF.md, `git log -n 10`, `git status`, and the
   tail of .handoff_log. If the last session was cut off, the most recently
   changed files may be INCOMPLETE - verify them first, finish or fix them.
2. Before starting any multi-step change, write the plan into HANDOFF.md
   ("In progress") BEFORE editing files, so a cutoff leaves a trail.
3. Work in small steps. Update HANDOFF.md after each one.
4. Never rely on chat history. Only the repo persists.
