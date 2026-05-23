# Best Practices — AI Podcast Script Generation

Everything learned building The Morning Cup, distilled into rules.
These apply to any show built on this infrastructure.

---

## Prompt Engineering

### What works

**Be surgical about sources.**
"Check doj.gov, fbi.gov, and atf.gov for press releases in the last 48 hours"
produces real, specific news. "Check news sources for crime" produces hallucinated
generalities. Every section should have named URLs.

**Set depth targets in words, not adjectives.**
"Cover housing in 100–150 words" is actionable. "Cover housing thoroughly" is not.
The model will interpret "thoroughly" as permission to write however much it wants —
usually either too little or too long.

**Tell it what to do when nothing happened.**
Dead news days exist. "If there are no new NLRB decisions, cover the most recent
significant labor action and what it means for workers this week" prevents the model
from writing "there are no updates" and moving on.

**Show it the tone, don't just describe it.**
Include 2–3 example sentences in your prompt that capture exactly how your host
sounds. The model will pattern-match to them more reliably than to abstract
adjectives like "warm" or "authoritative."

**Name every forbidden pattern explicitly.**
Don't assume the model knows what production notes are. List them:
`[music cue]`, `[production note]`, `[pause for effect]`. Each one should
be in the FORBIDDEN PATTERNS list in `src/validator.ts` as well.

**Collision detection must be explicit.**
Tell the model: "Never repeat a fact, statistic, person, or story in more than
one section. Each section must introduce new information." Without this, the
model will repeat the biggest headline of the day in three different sections.

**Build the JSON schema into the prompt.**
Don't say "output JSON." Paste the entire schema with field names, types, and
descriptions. Reasoning models follow explicit schemas reliably.

**Use ordinal dates in the spoken script, not cardinal.**
"April thirtieth" not "April thirty." ElevenLabs reads bare numbers as cardinals.
Build `spokenDate` (which emits ordinals) into your prompt and make sure the
model always uses the provided `{{SPOKEN_DATE}}` variable.

**Write numbers as spoken for TTS.**
- "twenty twenty-six" not "2026"
- "four-point-seven billion dollars" not "$4.7B"
- "forty-two percent" not "42%"
- "one hundred and fifty-three thousand" not "153,000"
Include this as an explicit TTS FORMATTING RULES block in your prompt.

**Phonetic scaffolding for difficult names.**
After the first mention of any difficult name, add a phonetic guide in brackets:
"Guadalupe García [gwah-dah-LOO-pay gar-SEE-ah]"
Verify pronunciation against Wikipedia or authoritative sources — never guess.

### What to avoid

**Escape hatches kill episodes.**
Never write "if there is no news on this topic, say so briefly and move on." The
model will use this clause even when there IS news. Remove all escape hatches.
Replace with: "There is always news. If nothing happened today, contextualize the
most recent relevant development."

**Avoid instruction overlap.**
If the same rule appears in two places with slightly different wording, the model
will find the interpretation that requires less work. Keep each rule in one place
and make it unambiguous.

**Never use vague length language.**
"A short paragraph" means 3 sentences to some models and 15 to others. Use words.

**Don't ask for summaries of summaries.**
Telling the model to "summarize today's top stories" produces
generic, headline-level coverage. Tell it exactly which stories, which sources,
and which angle.

**Avoid "balanced coverage" without defining it.**
"Cover both sides" on climate change, vaccine safety, or other settled science
is not balance — it's misinformation. Define what balance means for each topic
in your COVERAGE RULES block.

---

## Script Structure

### What works

**Cold open hook.**
Start the first section with a specific data point, surprising fact, or urgent
story that makes a listener who's half-awake suddenly pay attention.
"Good morning, today is [DATE]. A federal judge in Ohio just blocked [specific
action] and we'll get to that — but first..." beats "Good morning, welcome to
the show."

**Micro-hooks at section ends.**
End each section with a one-sentence forward reference: "Coming up — what the
latest labor numbers mean for your paycheck." This is the audio equivalent of
a "read more" — it keeps listeners through the transition sting.

**Section depth targets that match importance.**
Your most important sections should have the most words. A 75-word section
is a footnote. A 500-word section is a feature. Be intentional.

**The riddle is structural glue.**
Every Morning Cup episode has a riddle posed before the outro and answered at
the very end. This keeps listeners engaged through the sign-off. Use something
similar — a teased fact, a question, a promised reveal. It works.

**Transition bridges, not just stings.**
The sting is 10 seconds. After it, the host should land in the new section with
a short sentence that contextualizes the shift: "On the economic front today..."
Don't just start mid-sentence after a sting.

### What to avoid

**Throat-clearing kills momentum.**
"And now, moving on to our next topic..." is throat-clearing. Cut it. The sting
is the transition. Land directly in the content.

**Markdown tables in spoken scripts.**
Tables cannot be read aloud. The validator blocks them. Use prose comparisons
instead.

**Citation URLs in scripts.**
No one wants to hear "dot com slash press dash release slash twenty twenty-six."
Cite by institution and document name: "in a report from the Bureau of Labor
Statistics released yesterday."

**Repeated story introductions.**
"As we've been following..." followed by a full re-summary of a story that was
just covered two sections ago. The model loves this. Collision detection rules
prevent it.

---

## Voice Quality

### What works

**Stability 0.30–0.40 for emotional range.**
Lower stability = more expressive, more natural variation in delivery.
For news reading, this is usually right. Stability above 0.50 starts to
sound robotic.

**Similarity boost 0.80–0.90 for voice identity.**
This is how closely ElevenLabs adheres to the cloned voice. Below 0.75,
the voice starts to drift. Above 0.92, it can become rigid and robotic.

**Per-section voice presets.**
Warm sections (opening, riddle, personal stories) benefit from lower stability
and higher style. Hard news sections (crime, international conflict) benefit from
higher stability and lower style. The `getVoicePreset()` function in `src/index.ts`
handles this automatically — tune it for your show's section types.

**Good source audio makes the clone.**
The single biggest factor in ElevenLabs voice quality is the training data.
30 minutes minimum, 60+ preferred. Varied content, consistent recording setup,
zero background noise. Re-recording with better audio will improve the clone
significantly if early results are poor.

### What to avoid

**Do not use the same voice settings for every section.**
A 20-minute podcast with identical delivery in every section sounds like a
reading robot. The per-section preset system exists to prevent this.

**Pacing tags in production transcripts.**
`[pause]`, `[beat]`, `[warmly]` — these are stripped before TTS (via `PACING_TAGS`
in the chunker) but should not appear in the plain-text transcript or show notes.
Keep them in the script only.

---

## Infrastructure

### What works

**MIN_MERGE_CHARS = 80 in the chunker.**
This ensures that every section gets its own audio chunk and therefore its
own transition sting. Higher values cause sections to merge into the same chunk,
which means no sting between them. Keep this at 80 or lower.

**Prompt caching saves money and speeds generation.**
The MASTER_PROMPT is cached by OpenAI after the first daily call. Subsequent
calls in the same day reuse the cache at a 75% discount. Keep the static portion
of the prompt as large as possible — the more that's cached, the cheaper each run.

**Parallel TTS at concurrency 4.**
Four ElevenLabs chunks process simultaneously. This is the biggest speed
improvement in the pipeline. Don't reduce it unless you're hitting rate limits.

**KV corrections system for on-air corrections.**
Mistakes happen. The corrections bridge lets you push a correction via
`wrangler kv key put` that the next episode reads on-air, then auto-clears.
No redeploy, no manual script edit.

**Streaming the OpenAI response is non-negotiable.**
Non-streaming Responses API calls buffer the entire output server-side.
For a 3,000-word JSON output, that's 60–120 seconds of silence, which
Cloudflare kills. The streaming SSE implementation in `src/openai.ts` is
required — do not change it to a non-streaming call.

### What to avoid

**Do not put secrets in wrangler.toml.**
API keys, voice IDs, and run secrets go into `wrangler versions secret put`.
Never committed, never in version control.

**Do not change the R2 bucket.**
The `vicinity` bucket is Fold 42's shared storage. `R2_KEY_PREFIX` controls
your path inside it. A new show never gets its own R2 bucket — the prefix
is what separates shows.

**Do not bypass the validator.**
The validator exists to prevent bad episodes from going to TTS (which costs
money). If the validator is rejecting valid episodes, fix the prompt — don't
weaken the validator. The spacer floor, word count floor, and forbidden
pattern checks are all there for a reason.

**Do not disable the repair pass.**
`ENABLE_REPAIR_PASS=true` is the safety net for first-pass underwriting.
Disabling it means any episode that comes in slightly short will fail the
whole run. Leave it on.

---

## Editorial

### What works

**Mandatory source lists produce verifiable journalism.**
Every section that can be sourced to a government agency or official document
should be. `doj.gov`, `bls.gov`, `scotusblog.com`, `weather.gov`, `nlrb.gov`
— these are primary sources. The model will use them if you name them.
If you don't name them, it will invent plausible-sounding facts.

**"Name the document" citation format.**
"According to a press release from the Department of Justice dated yesterday"
is better than "officials said." It's checkable. It builds trust. It reduces
hallucination because the model has to commit to a specific source.

**Strong coverage rules protect editorial integrity.**
The Morning Cup has explicit rules about immigration terminology, Gaza framing,
and climate coverage. These aren't just stylistic — they define the show's
editorial character and protect against the model drifting toward
default AI framing (which tends to be milquetoast corporate-speak).

**Topic deduplication across episodes.**
The 7-day topic memory (KV `topics:YYYY-MM-DD`) prevents the same story from
dominating consecutive episodes. The model is instructed to avoid covered stories.
This keeps the show fresh and forces coverage breadth.

### What to avoid

**The "no updates" escape hatch.**
The most common failure mode: the model writes "there are no updates on this
topic today." This happens when the prompt has an escape hatch ("if there's
nothing to report, say so"). Remove every escape hatch. There is always news.

**Neutral framing on non-neutral topics.**
Applying "both sides" framing to scientific consensus, documented atrocities,
or settled legal questions makes the show untrustworthy. Be explicit in your
coverage rules about which topics require framing, and what that framing is.

**Immigration framed as crime.**
This is explicit in The Morning Cup's coverage rules and should be in every
Fold 42 show's rules. "Undocumented immigrant," "asylum seeker," "migrant" —
never "illegal alien." Immigration enforcement is a policy story, not a crime
story. Keep them in separate sections with different framing.

**Letting the model choose what's important.**
The model has its own sense of what's newsworthy, which often skews toward
whatever dominated social media yesterday. Your TOPIC FLOW and SECTION DEPTH
TARGETS override this by telling the model exactly what to cover and how much
space to give it.

---

## Operations

### What works

**Reviewing the first episode of every new show live.**
Before a new show goes to its automated schedule, a producer should listen
to the full first episode alongside the script. Check: Does it sound like
the intended host? Are the sections in the right order? Is the tone right?
Are there any hallucinated facts?

**Watching the validator pass rate.**
If more than 1 in 10 episodes requires a repair pass, the prompt has a
structural problem. Fix the prompt, not the validator.

**Keeping an ear on voice drift.**
ElevenLabs voice clones can sound slightly different run-to-run, especially
at lower stability settings. Periodically compare recent episodes to early ones.
If drift is noticeable, consider resubmitting the voice clone with more training data.

### What to avoid

**Deploying prompt changes without testing.**
A single malformed prompt change can break the JSON schema, remove the spacers,
or introduce a forbidden pattern that the validator catches too late. Always
test on a `force=true` run before the next scheduled episode.

**Accumulating prompt debt.**
Every time you add a new rule to the prompt without removing an old one,
you're adding tokens and complexity. Long prompts with redundant instructions
confuse the model. Audit the prompt quarterly and remove anything that's
no longer needed.

**Ignoring rejection logs.**
Failed episodes land in R2 under `your-prefix/rejected/`. These contain the
raw AI output that failed validation. Reading them tells you exactly what
the model got wrong and why. Check them after any string of failures.
