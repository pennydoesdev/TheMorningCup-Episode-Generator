# Changelog

Reverse-chronological summary of significant changes to the pipeline. For
the full git log: `git log --oneline main`. Use this page for "what's new
since the last time I looked at the repo."

## 2026-05-22 — Transcription, metadata file, episode titles, SEO, tags, loudness normalization, topic memory

A large batch of post-production and publishing improvements:

**Transcription** (`scripts/transcribe-episode.py` — new):
- Generates a `.srt` (SubRip) and `.vtt` (WebVTT) transcript alongside the finished MP3.
- Provider auto-selection: Groq ($0.01/episode, ~16 s) → mlx-whisper (free, Apple Silicon) → faster-whisper (free, CPU/GPU) → OpenAI Whisper API ($0.10/episode).
- Reads `GROQ_API_KEY` and `OPENAI_API_KEY` from `.env`; local providers require no key.
- Model: `whisper-large-v3-turbo` (near-identical accuracy to large-v3 at 2-6x faster).
- `morning-cup.sh make` auto-runs transcription after build when a key is present.
- `morning-cup.sh transcribe [DATE]` runs it on demand.

**Episode metadata file** (`src/description.ts` — new, `src/index.ts` updated):
- Every successful run writes `The Morning Cup - <DATE> - Metadata.txt` to R2 and (via `fetch-chunks.sh`) to `Episodes/` alongside the MP3.
- Contains in one place: post title, feed title (for MP3/RSS), episode number, season, date, host, publisher, runtime, copyright, genre, SEO title, SEO meta description, comma-separated WordPress tags, 3 title options, full 2-3 paragraph episode description, chapters, show notes/sources, today's riddle, and social media copy.

**Episode title generation** (`src/description.ts`, `src/manifest.ts`):
- A single `gpt-4o-mini` call generates 3 subtitle options (≤10 words each, different styles: punchy/warm/sharp).
- Primary title becomes `The Morning Cup: <subtitle>` — written to ID3 tags, RSS feed, and the metadata file.
- The metadata file clearly separates **Post Title** (the short subtitle), **Feed Title** (full show+subtitle for MP3/RSS), and **SEO Title** (Ep. N: format for Yoast/RankMath).

**SEO fields** (`src/description.ts`):
- Same `gpt-4o-mini` call also returns: SEO title (≤60 chars, "Ep. N: Subtitle | The Morning Cup"), SEO meta description (150-160 chars for Yoast/RankMath), and 10-14 comma-separated tags for WordPress.
- All three appear in the metadata file header alongside episode/season info.

**Episode numbering** (`src/utils/date.ts`, `scripts/build-episode.sh`):
- Episode number = day of year (1–366). Season = year (e.g. 2026).
- Written to ID3 `track` (episode) and `disc` (season) frames.
- Used in SEO title prefix ("Ep. 142: ...").

**Loudness normalization** (`scripts/build-episode.sh`):
- After concat, a second ffmpeg pass normalizes the assembled episode to **-16 LUFS** (EBU R128 podcast standard), true peak -1.5 dBFS.
- Most podcast hosts normalize on their end anyway, but this ensures the file sounds correct on direct downloads and smart speakers.

**Topic memory / deduplication** (`src/topics.ts` — new, `src/prompt.ts` updated):
- After each successful run, chapter titles and source note titles are stored in KV under `topics:YYYY-MM-DD` with a 30-day TTL.
- Before generation, the last 7 days of covered stories are fetched and injected into the prompt as a "RECENT STORIES — do NOT re-cover" block.
- Prevents the AI from repeating the same stories on consecutive days.

**Sound file changes** (`scripts/build-episode.sh`, `scripts/write-chapters.py`, `scripts/morning-cup.sh`):
- Entrance song renamed: `The Morning Cup - Song.wav` → `Spark.mp3`.
- `Cream or sugar, hon?.mp3` removed from the pipeline entirely (no longer required).
- Section transition sting: `morning-cup-sting.wav` → `Topic Transition.mp3`.
- Required sounds are now: `Spark.mp3`, `Coffee Pour.wav`, `Topic Transition.mp3`, `The Morning Cup - Thank You.wav` (plus optional `intro-sting.wav`).

**Smart section sting placement** (`scripts/write-chapters.py`, `scripts/build-episode.sh`):
- Section stings now insert only before chunks that start a new section, not between every chunk.
- Manifest's `starts_section_indices` field drives this — chunks that are continuations of a split section don't get a sting.

**Cover art generator removed**:
- `scripts/generate-cover-art.py` deleted. All references removed from `morning-cup.sh`.

**`morning-cup.sh` improvements**:
- New `transcribe [DATE]` subcommand.
- `make` pipeline now: preflight → trigger → poll → fetch → build → transcribe (5 steps).
- `make` auto-runs transcription after build when `GROQ_API_KEY` or `OPENAI_API_KEY` is set in `.env`.

---

## 2026-05-01 — Auto-publishing pipeline complete (Drive + S3 + WordPress)

End-to-end auto-publishing landed and was verified with a real episode upload:

**Worker side** (`src/publish.ts` invoked at end of every successful run):
- Generates a 400–500 word episode description via OpenAI from the manifest, social copy, and first 1500 chars of the script.
- Uploads chunks/txt/html/json/manifest to a dated Google Drive folder via service-account JWT auth.
- Creates a WordPress `serve_episode` draft via REST API.
- Best-effort: failures log via `wrangler tail` but do NOT fail the run.

**Local side**:
- `scripts/push-final-to-drive.py` — uploads the final assembled MP3 to the same dated Drive folder.
- `scripts/upload-audio.py` — uploads the MP3 to S3, then PATCHes the WordPress draft's audio meta.
- `scripts/build-episode.sh` calls both helpers automatically after rendering, gated on env-var presence.

---

## 2026-05-01 — Chapters, walkthrough doc, length-extend pass

**MP3 chapter markers** (`scripts/write-chapters.py`):
- Every rendered episode now embeds ID3v2 CTOC + CHAP frames.
- Apple Podcasts, Overcast, Spotify, Pocket Casts, Buzzsprout, etc. all read these automatically.

**Length-extend fallback** (`src/repair.ts`):
- After the standard repair pass, if the script is still under the word/runtime floor, a third aggressive pass fires.

**Three new editorial sections in the master prompt:**
- `Power Map`, `Cost of Living Check`, `What Comes Next`.

---

## 2026-05-01 — Local pipeline overhaul

Folder layout standardized under `~/Documents/The Morning Cup/`. `build-episode.sh` (pure ffmpeg) replaces DaVinci Resolve as the recommended workflow. `fetch-chunks.sh` added. Wrangler 4.x R2 syntax updated.

---

## 2026-05-01 — Worker reliability fixes

Streaming OpenAI responses, inline `await runEpisode()`, web search instead of RSS feeds, parallel TTS at concurrency 4, switched default model to `gpt-5-mini`.

---

## Earlier — initial deployment

Cloudflare Worker scaffold, OpenAI Responses API, ElevenLabs TTS, master editorial prompt, validator, chunker, repair pass, manifest + files.txt, cron at 5 AM ET.
