# Changelog

Reverse-chronological summary of significant changes to the pipeline. For
the full git log: `git log --oneline main`. Use this page for "what's new
since the last time I looked at the repo."

## 2026-05-01 — Chapters, walkthrough doc, length-extend pass

**MP3 chapter markers** (`scripts/write-chapters.py`):
- Every rendered episode now embeds ID3v2 CTOC + CHAP frames.
- Apple Podcasts, Overcast, Spotify, Pocket Casts, Buzzsprout, etc. all
  read these automatically — no per-platform configuration.
- The model emits a `chapters: [{ title }]` array (one per major section,
  Title Case, < 40 chars) as part of the strict JSON output.
- Chunker tracks `starts_section_indices` per chunk so chapter titles map
  cleanly back to chunk-level start times even with merged or split
  sections.
- See [`CHAPTERS.md`](./CHAPTERS.md) for the full design + verification.

**Length-extend fallback** (`src/repair.ts` + `extendEpisode()` in
`src/openai.ts`):
- After the standard repair pass, if the script is still under the word /
  runtime floor, a third aggressive pass fires.
- Tells the model exactly how many words it's short, names which sections
  to deepen, forbids deletion of existing content, has `web_search`
  available for fresh material to fill the gap.
- Triggers only on length failures (not structural ones), so the standard
  repair's structural fixes don't get reopened.

**Three new editorial sections in the master prompt:**
- `Power Map` — zooms out from headlines to the larger power structure
  (corporate consolidation, billionaire influence, judicial power, etc.)
- `Cost of Living Check` — translates economic headlines into rent /
  groceries / wages / labor reality
- `What Comes Next` — looks 24-72 hours forward at votes, hearings,
  strikes, deadlines, escalation risks
- Topic flow now has 28 numbered sections (was 25); chapter markers map
  one-per-section.

**New end-to-end walkthrough doc** at [`WALKTHROUGH.md`](./WALKTHROUGH.md).

## 2026-05-01 — Documentation overhaul

Initial `docs/` folder with six pages:

- `SETUP.md` — first-time setup, prereqs, secrets, sound assets
- `DAILY-WORKFLOW.md` — the two-command morning routine
- `EDITING.md` — how `build-episode.sh` stitches the timeline + tagging
- `PROMPTS.md` — ElevenLabs prompts that have worked (stings, voice lines)
- `TUNING.md` — every config knob and what's safe to change
- `TROUBLESHOOTING.md` — real issues we hit + the fixes

(Added `TRANSCRIPTS.md`, `CHAPTERS.md`, and this `CHANGELOG.md` shortly
after.)

## 2026-05-01 — Local pipeline overhaul

Folder layout standardized under `~/Documents/The Morning Cup/`:
```
Sounds/      reusable audio assets (6 files)
Scripts/     local working copies of helper scripts
Chunks/<DATE>/  per-day raw chunks pulled from R2
Episodes/    final tagged MP3s
Generator/   git clone of this repo (source of truth)
```

**`scripts/build-episode.sh`** — pure ffmpeg assembler. Replaces the
DaVinci Resolve scripting path as the recommended workflow because:
- Free Resolve doesn't allow Terminal-driven scripting (Studio-only).
- ffmpeg is faster (~5s end-to-end), runs anywhere, has no popup quirks.
- Resolve script (`scripts/build-resolve-timeline.py`) still exists for
  Studio users who want a Resolve project file to hand-edit.

**`scripts/fetch-chunks.sh`** — wrapper that pulls today's manifest +
chunks from R2 into `Chunks/<DATE>/`. Idempotent (skips already-downloaded
files), supports `<DATE>` arg or `--latest` for auto-detect.

**Wrangler 4.x R2 syntax** — `r2 object get` now takes `bucket/key` as one
positional + requires `--remote`. Old syntax broke; updated.

**Manifest carries full podcast metadata** — `publisher`,
`copyright_holder`, `genre`, `year`, `show_name` plumbed through from
`wrangler.toml` into every manifest, then read by `build-episode.sh` to
ID3-tag the final MP3 and by `write-chapters.py` to set chapter titles.

**Date pronunciation fix** — `spokenDate()` now emits ordinals
("April 30th, 2026") because ElevenLabs sometimes voices bare numbers as
cardinals ("thirty") instead of ordinals ("thirtieth").

## 2026-05-01 — Worker reliability fixes

**OpenAI Responses streaming + AbortController** (`src/openai.ts`)
- Calls now use `stream: true` so SSE bytes flow continuously and
  Cloudflare doesn't drop the long subrequest as idle.
- 8-minute per-attempt abort timeout so a genuinely hung call surfaces
  an error instead of hanging forever.
- Handles `response.output_text.delta` / `response.output_text.done` /
  `response.completed` / `response.failed` events from the SSE stream.

**Inline `await runEpisode()`** (`src/index.ts`)
- Removed `ctx.waitUntil()` — Cloudflare cancels those tasks shortly
  after the response is sent, far less than the 60-180s OpenAI generation
  needs. The worker was being killed mid-call, leaving runs stranded at
  `"generating"`.
- Both fetch and scheduled handlers now await the run directly. Wall time
  on a fetch handler isn't capped while we're awaiting a network call.

**Web search instead of RSS feeds** — model now calls OpenAI's built-in
`web_search` tool to research yesterday's news during generation. RSS
feeds become optional supplemental hints rather than the sole basis. The
"no source digest" disclaimer the model used to write into the script
is gone.

**Reasoning-model temperature handling** — `gpt-5*`, `o1*`, `o3*`, `o4*`
reject `temperature` on the Responses API; auto-omitted now.

**Parallel TTS at concurrency 4** (`src/index.ts`) — replaces the
sequential `for (chunk of chunks) await synthesize()` loop. ~4x faster
TTS phase for ~22-chunk episodes.

**Switched default model to `gpt-5-mini`** — better balance of speed and
length-following than `gpt-4.1`.

## Earlier — initial deployment

- Cloudflare Worker scaffold: fetch + scheduled handlers, R2 + KV
  bindings, Resend email path
- OpenAI Responses API client with strict JSON schema
- ElevenLabs TTS chunk synthesis
- Master editorial prompt (leftist anti-capitalist working-class lens)
- Validator (word count, runtime, structural rules)
- Chunker (split on `[TEN-SECOND SECTION SPACER]`, merge short, hard-cap
  at `MAX_TTS_CHARS_PER_CHUNK`)
- Single-pass repair on validation failure
- Manifest + ffmpeg files.txt output
- Cron at 5 AM ET, idempotent run records in KV + R2
