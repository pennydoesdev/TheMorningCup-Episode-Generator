# Changelog

Reverse-chronological summary of significant changes to the pipeline. For
the full git log: `git log --oneline main`. Use this page for "what's new
since the last time I looked at the repo."

## 2026-05-23 — New sections, voice presets, transcript generator, corrections system, AI disclosure, script optimization

A large batch of editorial, production, and transparency improvements:

**New editorial sections** (`src/prompt.ts`, `src/openai.ts`):
- Supreme Court Watch (scotusblog.com + supremecourt.gov mandatory)
- Voting Rights / Election Integrity
- Housing (national market trends only — no individual evictions; working-class focus)
- Labor / Union Watch (nlrb.gov mandatory)
- Reproductive Rights (Dobbs fallout, mifepristone, clinic access)
- Education (ed.gov/news mandatory)
- On This Day in Labor & Civil Rights History (30–60 words; verified against Wikipedia, Smithsonian, LOC, Archives.gov, family foundations)
- Total section count: 35 items with dedicated depth targets per section

**Runtime targets updated**:
- Floor: 15 min / 2,175 words
- Sweet spot: 18–20 min / 2,610–2,900 words
- Hard ceiling: 25 min / 3,625 words
- Spacer floor: 23 (one per section)

**Opening announcement rule**: after host intro, state listening time + 2–3 story tease + "But first…"

**Outro CTA**: before sign-off — "If today's show was worth your time, consider sharing it… exclusive access to cutting-edge journalism… consider becoming a paid member at Fold 42."

**Script optimization rules** (`src/prompt.ts`):
- TTS speech formatting: numbers written as spoken (2026 → "twenty twenty-six"), acronyms expanded on first mention, phonetic scaffolding for difficult names
- Citation format rule: name the document/agency, not "officials say"
- Collision detection: no story repeated across sections
- Coverage rules: immigration is NOT a crime; required terminology ("undocumented immigrant", "asylum seeker", "migrant"); never "illegal alien"

**Per-section voice presets** (`src/elevenlabs.ts`, `src/index.ts`):
- `getVoicePreset()` applies different ElevenLabs stability/style settings per section type
- Warm/narrative sections (opening, riddle, On This Day): lower stability, higher style
- Hard news (politics, crime, international, Gaza): higher stability, lower style
- Data sections (weather, housing, trade): mid stability/style

**Corrections bridge** (`src/index.ts`, `src/prompt.ts`):
- Worker reads `pending_corrections` key from KV at run start
- Corrections are read on-air before the story tease ("Before we begin, a correction from yesterday…")
- KV key auto-deleted after successful use
- Set via: `wrangler kv key put --binding MORNING_CUP_KV pending_corrections "your text"`

**Mandatory research sources** (`src/prompt.ts`):
- Weather: weather.gov, Cal Fire (calfire.ca.gov), InciWeb, NHC (nhc.noaa.gov), AirNow.gov
- Crime/justice: doj.gov, fbi.gov, atf.gov, dea.gov
- Intelligence: cia.gov, nsa.gov (with civil liberties lens)
- Supreme Court: scotusblog.com, supremecourt.gov
- Labor: nlrb.gov
- Education: ed.gov/news

**AI & voice disclosure** (`src/description.ts`):
- `DISCLOSURE` constant with four platform-specific variants: showNotes (full), spotify (required AI label), apple/iHeart/Amazon, youtube (audiogram + Studio checkbox note)
- Full showNotes disclosure appended to every generated episode description (present in every CMS import)
- Dedicated "AI & VOICE DISCLOSURE" section in every Metadata.txt — copy-paste ready for each platform
- Optional spoken disclosure line for first-listen/new-subscriber episodes
- Positions Penelope Rose as real person with consent and revenue sharing

**Transcript generator** (`scripts/generate-transcript.py` — new):
- Outputs `The Morning Cup - YYYY-MM-DD.txt` (clean plain-text with section headers) and `.srt` (section-timed subtitles)
- Section timestamps calculated via ffprobe — matches actual chapter marker timing
- Requires episode JSON (downloaded automatically by updated `fetch-chunks.sh`)

**fetch-chunks.sh updated**:
- Now also downloads `The Morning Cup - YYYY-MM-DD.json` (episode JSON) alongside chunks, required by `generate-transcript.py`

**Song names updated** (was done in prior session, comments now also fixed):
- Intro: `Spark.mp3` → `Hello.mp3`
- Outro: `The Morning Cup - Thank You.wav` → `Goodbye.mp3`

**Chunker** (`src/chunker.ts`):
- `MIN_MERGE_CHARS` reduced from 600 → 80; prevents sections from merging into the same chunk, ensuring every section boundary triggers its own transition sting

**Dependency maintenance**:
- `package-lock.json` regenerated to match wrangler 4.x and current deps; fixes Cloudflare dashboard `npm ci` failures

---

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
