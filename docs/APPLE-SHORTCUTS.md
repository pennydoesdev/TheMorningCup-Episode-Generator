# Apple Shortcuts

Run the whole pipeline from the macOS menu bar, Spotlight, a hotkey, or
Siri. Each Shortcut is just a one-line shell call into
`scripts/morning-cup.sh`, so they're trivial to maintain.

## What you'll have when you finish

| Shortcut | What it does | Suggested hotkey |
|----------|--------------|------|
| **Make Today's Morning Cup** | End-to-end: trigger worker, wait, fetch, build, render | ⌃⌥⌘ M |
| **Fetch & Build Latest** | Pull today's chunks + assemble (when cron already ran) | ⌃⌥⌘ B |
| **Open Latest Episode** | Open the newest rendered MP3 in your default player | ⌃⌥⌘ O |
| **Check Worker Status** | Show today's run-record JSON in an alert | ⌃⌥⌘ S |

## One-time setup

### 1. Pull the wrapper script into your `Scripts/` folder

```bash
cd "$HOME/Documents/The Morning Cup/Generator" && git pull origin main
cp "$HOME/Documents/The Morning Cup/Generator/scripts/morning-cup.sh" \
   "$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh"
chmod +x "$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh"
```

### 2. Save your `RUN_SECRET` where the wrapper can find it

The Apple Shortcuts shell environment is sandboxed and doesn't load your
shell profile. Put the secret in a `.env` file the wrapper reads on every
run:

```bash
echo 'RUN_SECRET="<your-actual-secret>"' > "$HOME/Documents/The Morning Cup/.env"
chmod 600 "$HOME/Documents/The Morning Cup/.env"
```

(`.env` lives outside the git repo so it never gets committed.)

### 3. Confirm the wrapper works from Terminal first

```bash
"$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" status
```

You should see today's run record JSON. If you see a permission error,
the .env didn't load — check the path and the chmod.

---

## Shortcut 1 — "Make Today's Morning Cup"

End-to-end. Triggers the worker, waits up to ~25 minutes for completion,
fetches chunks, assembles the final MP3 with chapters, opens it.

**Build it:**

1. Open **Shortcuts.app**.
2. Click **+** to create a new shortcut.
3. Name it `Make Today's Morning Cup`.
4. From the right sidebar, search for **Run Shell Script** and drag it
   into the workflow area.
5. In the Run Shell Script action:
   - **Shell:** `/bin/zsh`
   - **Input:** `nothing`
   - **Pass Input:** `to stdin` (default; doesn't matter here)
   - **Run as Administrator:** off
   - Paste this into the script box:
     ```bash
     "$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" make
     ```
6. Below that action, search **Show Notification** and add it. Set:
   - **Title:** `Morning Cup ready`
   - **Body:** select **Shell Script Result** as a Magic Variable (last
     line of the wrapper's output is the file path)
7. Click **i** (top right) → check **Pin in Menu Bar** + **Use as Quick
   Action** + **Services Menu**.
8. Set keyboard shortcut to **⌃⌥⌘ M** (Control + Option + Cmd + M) under
   the Details panel.
9. Save.

Now hit ⌃⌥⌘ M from anywhere on your Mac. ~6-10 minutes later the
notification fires with the path to today's MP3.

---

## Shortcut 2 — "Fetch & Build Latest"

When the cron already ran (your usual morning case), this just pulls
chunks + builds. No worker trigger, no waiting on OpenAI/ElevenLabs.

**Build it:**

1. Shortcuts.app → **+** → name it `Fetch & Build Latest`.
2. **Run Shell Script** action:
   - **Shell:** `/bin/zsh`
   - Script:
     ```bash
     "$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" fetch && \
     "$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" build
     ```
3. Add **Show Notification**:
   - **Title:** `Morning Cup built`
   - **Body:** Shell Script Result
4. Hotkey: **⌃⌥⌘ B**.
5. Save.

---

## Shortcut 3 — "Open Latest Episode"

Quickest way to play yesterday's or today's episode for review.

**Build it:**

1. Shortcuts.app → **+** → name it `Open Latest Episode`.
2. **Run Shell Script** action:
   ```bash
   "$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" latest
   ```
3. (No notification needed — the file opens directly.)
4. Hotkey: **⌃⌥⌘ O**.
5. Save.

---

## Shortcut 4 — "Check Worker Status"

Quick diagnostic — shows today's run record without triggering anything.

**Build it:**

1. Shortcuts.app → **+** → name it `Check Worker Status`.
2. **Run Shell Script** action:
   ```bash
   "$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" status
   ```
3. Add a **Show Result** action below it (search "show result" — it shows
   the previous step's output in a popup).
4. Hotkey: **⌃⌥⌘ S**.
5. Save.

You'll see a popup with JSON like:
```json
{
  "date": "2026-05-01",
  "record": {
    "episode_date": "2026-05-01",
    "status": "completed",
    "word_count": 3451,
    "estimated_runtime_minutes": 24.16,
    "chunk_count": 22
  }
}
```

---

## Optional polish

### Pin the shortcuts to your Menu Bar

In each Shortcut's settings (the **i** button at top right), check **Pin
in Menu Bar**. Now there's a Shortcuts icon in your menu bar with these
items in a dropdown — clickable in addition to the keyboard shortcut.

### Use them from Spotlight

Just hit ⌘-Space and start typing the shortcut name. Spotlight surfaces
shortcuts as runnable items.

### Use them with Siri

"Hey Siri, run Make Today's Morning Cup."

### Use them from a Stream Deck or hardware button

If you have a Stream Deck or similar, add a button that triggers the
shortcut by name via the Shortcuts integration.

### Customize the dates

Each Shortcut as written defaults to today's date in America/New_York.
For an "Open episode for date" prompt:

1. Add an **Ask for Input** action above the Run Shell Script.
   - **Prompt:** `Episode date (YYYY-MM-DD)`
   - **Input Type:** Text
   - **Default Answer:** Run a small bash subshell or just leave blank
2. In the Run Shell Script, reference the input as the first argument:
   ```bash
   "$HOME/Documents/The Morning Cup/Scripts/morning-cup.sh" build "$1"
   ```
   Then in the action's **Pass Input** dropdown, pick **As Arguments**.

---

## Troubleshooting Apple Shortcuts

**Shortcut runs but nothing happens.**
Check **Console.app** for the Shortcuts process logs, or run the same
command in Terminal. Often it's a `PATH` issue (ffmpeg / wrangler not
found). The wrapper already adds `/opt/homebrew/bin` and `/usr/local/bin`
to PATH; if your tools live elsewhere, add that location at the top of
`morning-cup.sh`.

**"Permission denied" or .env not loading.**
The Shortcut runs as your user but with a sandboxed environment. The
wrapper sources `~/Documents/The Morning Cup/.env` at the start of every
run. Make sure the file exists, is owned by you, and `chmod 600`.

**Worker times out.**
The default `--max-time 1500` (25 min) wraps the curl call inside the
wrapper's `make` subcommand. Real runs are 4-9 min. If you regularly
exceed 25 min, edit the wrapper or use `Fetch & Build Latest` instead
(skips the trigger and just pulls/builds, assuming the cron already ran).

**Notification text is truncated.**
macOS notifications truncate long content. The wrapper's last printed
line is the file path, which is the most useful single piece of info.
For more detail, use **Show Result** (modal popup) instead of **Show
Notification**.
