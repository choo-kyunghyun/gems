#!/usr/bin/env python
"""View and control the ComfyUI server queue.

  python jobs.py                    # running + pending jobs
  python jobs.py --history 10      # last N finished prompts
  python jobs.py --interrupt       # stop the currently running prompt
  python jobs.py --clear           # drop every pending prompt
  python jobs.py --delete ID       # drop one pending prompt

(Named jobs.py, not queue.py -- a queue.py here would shadow the stdlib module.)
"""

import argparse
import sys

import comfylib as C


def show_queue(client):
    q = client.queue()
    running = q.get("queue_running", [])
    pending = q.get("queue_pending", [])
    if not running and not pending:
        print("queue empty")
        return
    for item in running:
        print(f"running : {item[1]}")
    for i, item in enumerate(pending):
        print(f"pending : {item[1]}  (position {i + 1})")


def show_history(client, count):
    hist = client.history()
    if not hist:
        print("history empty")
        return
    items = list(hist.items())[-count:]
    for prompt_id, entry in reversed(items):
        status = entry.get("status") or {}
        state = status.get("status_str") or (
            "success" if entry.get("outputs") else "?")
        files = [f.get("filename", "?")
                 for out in (entry.get("outputs") or {}).values()
                 for f in out.get("images", [])]
        suffix = f"  {len(files)} file(s): {', '.join(files[:3])}" if files else ""
        print(f"{prompt_id}  {state}{suffix}")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--history", type=int, nargs="?", const=10, metavar="N",
                    help="show the last N finished prompts (default 10)")
    ap.add_argument("--interrupt", action="store_true",
                    help="interrupt the running prompt")
    ap.add_argument("--clear", action="store_true", help="clear pending prompts")
    ap.add_argument("--delete", metavar="PROMPT_ID", help="delete one pending prompt")
    ap.add_argument("--server", help="host:port (default: local/config.json "
                                     "or " + C.DEFAULT_SERVER + ")")
    args = ap.parse_args()

    client = C.Client(server=args.server)
    acted = False
    if args.interrupt:
        client.interrupt()
        print("interrupted")
        acted = True
    if args.delete:
        client.delete_queued([args.delete])
        print("deleted", args.delete)
        acted = True
    if args.clear:
        client.clear_queue()
        print("pending queue cleared")
        acted = True
    if args.history is not None:
        show_history(client, args.history)
    elif not acted:
        show_queue(client)


if __name__ == "__main__":
    try:
        main()
    except C.ComfyError as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
