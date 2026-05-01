// shows/example/prompt.ts
//
// A minimal example master prompt. Replace with your show's actual brief.

export const PROMPT = `Create a daily news podcast script for [SHOW TITLE], hosted by [HOST NAME].

The script must open with: "Good morning, today is [CURRENT DATE]. I am [HOST NAME], and this is [SHOW TITLE] from [PUBLISHER]."

The script must end with: "I am [HOST NAME]. Thank you for listening to [SHOW TITLE]. We will be back soon."

CRITICAL RUNTIME RULE:
- The host-read script MUST produce 20-25 minutes of spoken audio at a natural news-host pace.
- Target 22-25 minutes; 20 minutes is the absolute floor.
- Aim for 3,300-3,700 spoken words.

EDITORIAL APPROACH:
- (Replace with your show's editorial perspective.)
- (e.g. tone, target audience, ethical guidelines, what makes this show distinct)

SOURCING:
- Use the web_search tool to research yesterday's actual news.
- Cite real source URLs in source_notes.
- Do not invent facts.

TOPIC FLOW (in order):
- Insert a [TEN-SECOND SECTION SPACER] line between every major section.
- Sections for this show:
  - Positive Opening
  - Top Story
  - Politics
  - Economy
  - International
  - Closing Thoughts

TRANSITIONAL PHRASES:
- After every spacer, introduce the next section by name with a short natural transition.
- Vary the transitions across the episode. Do not repeat the same phrase twice.
- Examples: "Now we go to...", "Onto...", "Up next...", "Let's turn to...",
  "Time for...", "Here's...", "Switching to...", "And now..."

ELEVENLABS FORMATTING:
- Short spoken lines, one idea per line.
- Use [pause], [beat], [gentle pause], etc. sparingly for delivery.
- No music cues, no production notes, no voice-description notes.

OUTPUT FORMAT:
- Return strict JSON only matching the schema (show_title, episode_date,
  source_date, estimated_runtime, elevenlabs_script, riddle_question,
  riddle_answer, social_copy, source_notes, self_validation, chapters).
- Chapters array: one entry per spacer-separated section, in order, Title Case,
  under 40 characters.

CHAPTERS REQUIREMENT:
- One chapter per major section in the topic flow.
- The pipeline writes these as MP3 ID3 chapter markers so listeners can jump
  between sections in their podcast app.

SECTION LABELS:
- Speak each section's name as the host introduces it (paired with the audio sting).
- Do NOT write all-caps headings or label-style lines like "POLITICS:" inside
  the spoken script. Section intros are spoken sentences.

FINAL REQUIREMENT:
- Produce a host-read script that is ALWAYS at least 20 minutes and NEVER
  longer than 25 minutes.
- End grounded, constructive, and on-brand for [SHOW TITLE].
`;
