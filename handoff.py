#!/usr/bin/env python3
"""
handoff.py - two AI assistants (Claude + ChatGPT, or two accounts), one project, resumable even after a sudden cutoff.

  python handoff.py init          one-time setup (git, HANDOFF.md, CLAUDE.md, Claude Code hook)
  python handoff.py snap          auto-snapshot: commit WIP + log changed files (no Claude needed)
  python handoff.py watch [secs]  loop snap every N seconds (default 30) - for claude.ai/web use
  python handoff.py save A        deliberate checkpoint, stamps who saved
  python handoff.py resume        prints the takeover prompt (includes cutoff-recovery info)
  python handoff.py pack          writes HANDOFF_PACK.txt: resume prompt + all project files,
                                  for an account with NO git access (upload/paste it there)
  python handoff.py apply FILE    applies the files Account B returned, then snapshots
  python handoff.py out [A]       ONE STEP: save + pack, copy to clipboard -> paste into other account
  python handoff.py in            ONE STEP: take other account's reply from clipboard, apply, commit, push
"""
import subprocess, sys, time, json, datetime, pathlib

HANDOFF = pathlib.Path("HANDOFF.md")
CLAUDE = pathlib.Path("CLAUDE.md")
LOG = pathlib.Path(".handoff_log")

TEMPLATE = """# HANDOFF

Last saved by: (nobody yet)
Last saved at: -

## Goal
(what this project is and what "done" looks like)

## Done so far
-

## In progress (exact stopping point)
-

## Next steps (ordered)
1.

## Decisions & constraints
-
"""

RULES = """# Working protocol (two-account handoff)

Another AI assistant (Claude, ChatGPT/Codex, etc.) may take over at any time; you can be cut off mid-task.

1. START of session: read HANDOFF.md, `git log -n 10`, `git status`, and the
   tail of .handoff_log. If the last session was cut off, the most recently
   changed files may be INCOMPLETE - verify them first, finish or fix them.
2. Before starting any multi-step change, write the plan into HANDOFF.md
   ("In progress") BEFORE editing files, so a cutoff leaves a trail.
3. Work in small steps. Update HANDOFF.md after each one.
4. Never rely on chat history. Only the repo persists.
"""

HOOK = {"hooks": {"PostToolUse": [{"matcher": "Edit|Write|MultiEdit",
        "hooks": [{"type": "command", "command": "python handoff.py snap"}]}]}}

def sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True).stdout.strip()

def init():
    if not pathlib.Path(".git").exists(): sh("git", "init")
    if not HANDOFF.exists(): HANDOFF.write_text(TEMPLATE)
    if not CLAUDE.exists(): CLAUDE.write_text(RULES)
    gi = pathlib.Path(".gitignore")
    cur = gi.read_text() if gi.exists() else ""
    add = [x for x in ("HANDOFF_PACK.txt", "reply.txt") if x not in cur]
    if add: gi.write_text(cur + ("\n" if cur and not cur.endswith("\n") else "") + "\n".join(add) + "\n")
    if not pathlib.Path("AGENTS.md").exists(): pathlib.Path("AGENTS.md").write_text(RULES)
    d = pathlib.Path(".claude"); d.mkdir(exist_ok=True)
    s = d / "settings.json"
    if not s.exists(): s.write_text(json.dumps(HOOK, indent=2))
    print("Initialised. Claude Code hook installed: every file edit auto-snapshots.")
    print("Fill in Goal in HANDOFF.md. Push to a private remote so both accounts share it.")

def snap():
    changed = sh("git", "status", "--short")
    if not changed: return
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with LOG.open("a") as f:
        f.write(f"[{now}]\n{changed}\n")
    sh("git", "add", "-A")
    sh("git", "commit", "-m", f"wip snapshot {now}")

def watch(secs=30):
    print(f"Snapshotting every {secs}s. Ctrl+C to stop.")
    while True:
        snap(); time.sleep(secs)

def save(who):
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = HANDOFF.read_text().splitlines()
    for i, l in enumerate(lines):
        if l.startswith("Last saved by:"): lines[i] = f"Last saved by: Account {who}"
        elif l.startswith("Last saved at:"): lines[i] = f"Last saved at: {now}"
    HANDOFF.write_text("\n".join(lines) + "\n")
    snap()
    sh("git", "add", "-A"); sh("git", "commit", "-m", f"checkpoint by {who} @ {now}")
    print(f"Checkpoint by account {who}.")

def resume_text():
    log_tail = "\n".join(LOG.read_text().splitlines()[-25:]) if LOG.exists() else "(none)"
    return (
        "You are taking over a project from another AI assistant that hit its "
        "usage limit, possibly MID-TASK. Read CLAUDE.md/AGENTS.md and HANDOFF.md, then use the "
        "recovery info below to work out exactly where the last session stopped. "
        "The most recently changed files may be incomplete or inconsistent: check "
        "them first, finish or repair them, then continue from the next steps. "
        "Update HANDOFF.md as you go.\n\n"
        f"--- HANDOFF.md ---\n{HANDOFF.read_text()}\n"
        f"--- last commits ---\n{sh('git','log','-n','10','--oneline')}\n\n"
        f"--- uncommitted changes ---\n{sh('git','status','--short') or '(clean)'}\n\n"
        f"--- recent file activity (.handoff_log) ---\n{log_tail}\n\n"
        f"--- diff of last snapshot ---\n{sh('git','diff','HEAD~1','--stat')}\n"
    )

def resume():
    print(resume_text())

def pack(max_total=400_000, max_file=60_000):
    out = [
        "You have NO git access. I am relaying between you and the repo. "
        "Below is the full project state. Work on the task. When you stop (or "
        "before you run out), reply with EVERY file you created or changed, "
        "each COMPLETE (not a diff, no omissions), in exactly this format:\n"
        "<<<FILE path/to/file>>>\n(full file contents)\n<<<END>>>\n"
        "Always include an updated HANDOFF.md. Do not abbreviate files.\n\n"
    ]
    out.append(resume_text() + "\n\n=== PROJECT FILES ===\n")
    total = 0
    for f in sh("git", "ls-files").splitlines():
        if f in (".handoff_log", "HANDOFF_PACK.txt", "reply.txt") or f.startswith(".claude/"): continue
        try:
            data = pathlib.Path(f).read_text()
        except Exception:
            continue  # binary / unreadable
        if len(data) > max_file or total + len(data) > max_total:
            out.append(f"<<<FILE {f}>>>\n(skipped: too large, ask me to paste it)\n<<<END>>>\n")
            continue
        total += len(data)
        out.append(f"<<<FILE {f}>>>\n{data}\n<<<END>>>\n")
    pathlib.Path("HANDOFF_PACK.txt").write_text("".join(out))
    print(f"Wrote HANDOFF_PACK.txt ({total//1000} KB of files). Upload/paste it to the other account.")

def apply(path):
    import re
    text = pathlib.Path(path).read_text()
    blocks = re.findall(r"<<<FILE (.+?)>>>\n(.*?)\n<<<END>>>", text, re.S)
    if not blocks:
        print("No <<<FILE ...>>> blocks found."); return
    for name, body in blocks:
        name = name.strip()
        if name.startswith("/") or ".." in pathlib.Path(name).parts:
            print(f"Skipped unsafe path: {name}"); continue
        fp = pathlib.Path(name); fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(body + "\n"); print("wrote", name)
    snap()
    print("Review with `git diff HEAD~1`, then push from the account that has git access.")

import shutil, platform

def clip_set(text):
    sysname = platform.system()
    cmds = {"Darwin": ["pbcopy"], "Windows": ["clip"],
            "Linux": ["xclip", "-selection", "clipboard"]}
    cmd = cmds.get(sysname)
    if cmd and shutil.which(cmd[0]):
        subprocess.run(cmd, input=text, text=True); return True
    return False

def clip_get():
    sysname = platform.system()
    cmds = {"Darwin": ["pbpaste"],
            "Windows": ["powershell", "-command", "Get-Clipboard -Raw"],
            "Linux": ["xclip", "-selection", "clipboard", "-o"]}
    cmd = cmds.get(sysname)
    if cmd and shutil.which(cmd[0]):
        return subprocess.run(cmd, capture_output=True, text=True).stdout
    return ""

def out(who="A"):
    save(who); pack()
    text = pathlib.Path("HANDOFF_PACK.txt").read_text()
    if clip_set(text):
        print("Copied to clipboard. Paste it into the other account's chat.")
    else:
        print("No clipboard tool found. Upload HANDOFF_PACK.txt to the other account instead.")

def incoming():
    text = clip_get()
    if "<<<FILE" not in text:
        print("Clipboard has no <<<FILE ...>>> blocks. Copy the other account's full reply first."); return
    pathlib.Path("reply.txt").write_text(text)
    apply("reply.txt")
    sh("git", "add", "-A"); sh("git", "commit", "-m", "apply changes from other account")
    r = subprocess.run(["git", "push"], capture_output=True, text=True)
    print("Pushed." if r.returncode == 0 else "Applied and committed, but push failed:\n" + r.stderr)

if __name__ == "__main__":
    c = sys.argv[1] if len(sys.argv) > 1 else ""
    if c == "init": init()
    elif c == "snap": snap()
    elif c == "watch": watch(int(sys.argv[2]) if len(sys.argv) > 2 else 30)
    elif c == "save": save(sys.argv[2] if len(sys.argv) > 2 else "?")
    elif c == "resume": resume()
    elif c == "pack": pack()
    elif c == "out": out(sys.argv[2] if len(sys.argv) > 2 else "A")
    elif c == "in": incoming()
    elif c == "apply": apply(sys.argv[2])
    else: print(__doc__)
