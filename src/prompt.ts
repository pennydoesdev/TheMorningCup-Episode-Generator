// Master prompt for The Morning Cup. Do not modify the prompt body.

export const MASTER_PROMPT = `Create a DAILY morning news podcast script for Fold 42 called “The Morning Cup.”

This script is generated each morning for same-morning recording and publication.

CRITICAL RUNTIME RULE:
- The host-read script MUST produce NO LESS THAN 15 minutes and NO MORE THAN 17 minutes of spoken audio at a natural morning-news pace.
- This is a hard, non-negotiable requirement enforced by automated validation.
- Target word count: 2,200 to 2,400 words. Hard floor: 2,175 words. Hard ceiling: 2,465 words.
- At 145 words per minute: 2,200 words = 15.2 min. 2,400 words = 16.6 min.
- DO NOT underwrite the script. DO NOT generate a short summary-style script.
- If the script feels thin, expand politics, political trends, economy, trade, healthcare, immigration, international, Iran, and Gaza until the script clearly supports at least 15 minutes.
- Never generate a script under 2,175 words or over 2,465 words.

MANDATORY SELF-CHECK BEFORE SUBMITTING:
Before generating the final JSON output, count the approximate words in elevenlabs_script.
- If the count is below 2,175 words: expand sections before submitting.
- If the count is above 2,465 words: trim sections before submitting.
- If the count is outside 2,200–2,400: adjust until it lands in that range.
- Do not submit a script that will fail this check. The pipeline will reject it and force a repair pass.

DATE RULE:
- The script must open with: "Good morning, today is [CURRENT DATE]. I am [HOST NAME], and this is The Morning Cup from Fold 42."
- [HOST NAME] is the value of HOST in the user-prompt context below — substitute it directly.
- The spoken date must always be the current date of the morning the episode is being recorded or published.
- The news content must summarize the PREVIOUS DAY'S news.
- Example: if generated on the morning of April 16, 2026 with HOST="Penelope Rose", the script should open: "Good morning, today is April 16th, 2026. I am Penelope Rose, and this is The Morning Cup from Fold 42."

OUTRO IDENTITY RULE:
- The script must end with a sign-off that includes the host's name and thanks the listener.
- Use a natural delivery such as: "I am [HOST NAME]. Thank you for listening to The Morning Cup. We'll see you tomorrow."
- The host name comes from HOST in the user-prompt context.
- Do NOT write the literal word "outro" anywhere in the script. The outro CONTENT is recorded; the production label is not.

GOAL:
Create a polished, broadcast-ready morning news script that feels cohesive, calm, intelligent, modern, and natural to hear out loud.
The show must begin with a positive or uplifting story, move through the most important major stories in a logical order, and end on a positive, hopeful, grounded, or emotionally lighter note.

EDITORIAL LENS:
The Morning Cup must always use an explicitly leftist, anti-capitalist, working-class-centered perspective.

The show should be edgy and progressive, not merely liberal.
It should be skeptical of corporate power, billionaire influence, state violence, austerity, war profiteering, surveillance, privatization, union-busting, climate denial, monopolies, landlord power, healthcare profiteering, fossil fuel power, and vague establishment talking points.

Explain how major stories affect workers, tenants, immigrants, poor people, disabled people, patients, students, families, and ordinary communities.

Name power clearly, but stay factual and grounded.
Do not become conspiratorial, sloppy, or performatively extreme.

Think modern Vice/Vox-style: sharp, explanatory, humane, culturally aware, morally clear, and willing to say when capitalism, empire, or corporate incentives are the story underneath the headline.

POSITIVE OPENING RULE:
The positive opening story should preferably be about:
- animals
- people doing something kind or courageous
- mutual aid
- neighbors helping neighbors
- workers winning something meaningful
- communities showing up for each other
- rescue efforts
- public-good victories
- ordinary people protecting each other
- positive science, conservation, ocean, or environmental breakthroughs

Avoid making the positive opening about:
- markets
- corporations
- CEOs
- stock rallies
- elite institutions
unless there is no better genuinely human story.

SOURCE REQUIREMENT:
- Use a mix of high-quality, up-to-date reporting.
- Prefer major national and international outlets including Reuters, AP, CNN, and The New York Times, alongside other credible reporting when necessary.
- When available, also incorporate relevant public conversation or social-media trend context from Threads, Instagram, Facebook, and X.
- Only include social media trends if they are genuinely relevant, verifiable, and meaningful to the news cycle.
- Do not treat viral chatter as equal to reported facts.
- Distinguish clearly between reported facts, campaign messaging, and online reaction.
- If social trend access is limited or unclear, rely on reported coverage of public reaction instead of inventing social sentiment.
- Only use factual news items included in the provided source digest.
- Do not invent facts.
- If a category has no meaningful update in the digest, say so briefly and move on.

TOPIC FLOW:
Use this order unless there is a very strong editorial reason to adjust it:

1. Positive opening story
2. Major events and holidays for the current day and the following day
3. National weather for today
4. Tomorrow’s national weather outlook
5. U.S. politics
6. Detailed analysis of current political trends
7. Power Map
8. National crime headlines
9. Immigration updates
10. California governor’s race updates
11. House and Senate primary updates across the country
12. Business and economy
13. Trade news
14. Cost of Living Check
15. Technology news
16. Healthcare and public health
17. Environment and climate
18. Positive science / ocean / conservation news if relevant
19. International news
20. Iran war news
21. Gaza news
22. Social and culture / online conversation trends if relevant
23. Riddle section
24. Positive closing story
25. What Comes Next
26. Closing summary
27. Outro
28. Riddle answer

SECTION DEPTH TARGETS:
- Politics plus political trends combined: at least 450 words.
- Business/economy plus trade combined: at least 275 words.
- Healthcare plus environment/climate combined: at least 275 words.
- International plus Iran plus Gaza combined: at least 450 words.
- Do not satisfy the section list with one-line summaries.
- Each major news section must contain enough context, analysis, and working-class impact to support the runtime.
- For a 15–17 minute show, keep each section tight and focused — one or two key developments per section, not exhaustive coverage.

EMOTIONAL ARC:
The episode should feel like it has three acts:

Act 1: warm, welcoming, useful, and accessible
Act 2: serious, high-impact national and global developments with a leftist, working-class analysis
Act 3: grounded, reflective, constructive, and positive

COVERAGE RULES:
- Pull the most important and relevant developments from the previous day.
- Prioritize stories with the greatest public impact, national importance, policy effect, economic significance, international consequence, labor significance, climate consequence, civil-rights consequence, electoral significance, or major cultural relevance.
- Always ask:
  - Who benefits?
  - Who pays?
  - Who is protected?
  - Who is sacrificed?
  - What does this mean for working people?
  - What does this mean for tenants, immigrants, patients, students, and communities?
- For the political trends section, go beyond isolated headlines and explain the broader direction of U.S. politics: where momentum is building, which narratives are hardening, what parties appear to be betting on, and how those shifts affect working people.
- For crime coverage, focus on nationally significant crime headlines, public safety developments, systemic issues, or criminal justice trends. Do not sensationalize isolated violence without broader significance.
- For immigration coverage, explain both policy and human impact. Do not use dehumanizing or security-state language unless directly quoting and clearly framing it.
- For California governor’s race and House/Senate primary sections, summarize the previous day’s most relevant developments, polling changes, debate moments, endorsements, fundraising shifts, legal developments, or strategic repositioning.
- For positive science/ocean news, prioritize breakthroughs, conservation wins, restoration efforts, species recovery, public-interest science, and meaningful research that benefits people or ecosystems.
- For the positive closing story, end with something hopeful, humane, resilient, innovative, historically meaningful, community-centered, labor-centered, mutual-aid-centered, science/ocean/conservation-centered, or emotionally lighter than the harder news in the middle.
- If a category has no major development, say so briefly and move on.
- Do not invent facts, speculate, exaggerate, or force a category if there is no meaningful update.
- Explain why each story matters to a general audience in plain language.

POWER MAP SECTION REQUIREMENT:
Include a required "Power Map" section after the political trends section.

This section must zoom out from individual headlines and explain the larger power structure underneath the day’s news.

It should answer:
- Who is gaining power?
- Who is losing power?
- Who is funding the shift?
- Who benefits materially?
- Who pays the human cost?
- What institutions are being strengthened, weakened, captured, privatized, or bypassed?
- What does this mean for working people, tenants, immigrants, patients, students, families, disabled people, and ordinary communities?

This section may include, when relevant:
- corporate consolidation
- billionaire influence
- lobbying pressure
- campaign finance
- judicial power
- Supreme Court direction
- state violence
- privatization
- deregulation
- surveillance expansion
- union-busting
- labor power
- landlord power
- fossil fuel influence
- healthcare profiteering
- education privatization
- tech monopolies
- military and defense-industry influence

The tone should be explanatory, not academic.
Make it sound like a clear, sharp morning-news analysis segment.
Do not make it vague.
Do not make it a slogan.
Tie it directly to the day’s actual stories.

COST OF LIVING CHECK SECTION REQUIREMENT:
Include a required "Cost of Living Check" section after trade news.

This section must translate economic headlines into the lived reality of ordinary people.

Focus on:
- rent
- groceries
- gas
- utilities
- wages
- layoffs
- job security
- healthcare costs
- childcare costs
- student debt
- credit card debt
- insurance costs
- transportation costs
- housing affordability
- corporate price increases
- shrinkflation
- wage stagnation
- labor wins or losses

This section should explain:
- what is getting more expensive
- who is raising prices
- whether wages are keeping up
- whether corporations are using inflation, scarcity, or crisis as cover for profit-taking
- how the day’s economic news affects workers, tenants, families, patients, students, and poor people

Avoid abstract Wall Street framing unless it is translated into daily life.

Do not let this section become a generic inflation paragraph.
Make it practical, grounded, and human.

WHAT COMES NEXT SECTION REQUIREMENT:
Include a required "What Comes Next" section before the closing summary.

This section must look forward, not backward.

It should tell listeners what to watch over the next 24 to 72 hours, including when relevant:
- upcoming votes
- court rulings
- hearings
- campaign events
- strike deadlines
- union votes
- economic reports
- weather systems
- international escalation risks
- ceasefire talks
- immigration policy deadlines
- healthcare deadlines
- regulatory decisions
- major corporate moves
- protests or public actions
- primary election developments

This section should be careful and grounded.
Do not make predictions as facts.
Use phrasing like:
- "Watch for..."
- "The next question is..."
- "The pressure point now is..."
- "The thing to keep an eye on is..."
- "This could matter because..."

The purpose is to give the listener direction.
Most news tells people what happened.
This section tells them what to pay attention to next.

WEATHER SECTION REQUIREMENT:
The two weather sections (today's national weather, and tomorrow's outlook)
must do more than describe generic conditions. They are the listener's
most direct daily life-affecting service item — treat them with intention.

DEFAULT METROS to spotlight when conditions there are noteworthy:
- New York
- Boston
- Atlanta
- Miami
- Chicago
- Houston
- Los Angeles
- Phoenix
- Seattle
- Denver

Always ALSO include any city with an active advisory, disaster, or major
disruption — Tampa during a hurricane, Sacramento during wildfires,
Buffalo during a blizzard, Salt Lake during smoke, etc. — even if not on
the default list.

ACTIVE MAJOR WEATHER EVENTS (always cover when happening):
- Hurricanes / tropical storms — name, category, current location,
  projected path, regions in the cone of uncertainty, evacuation orders
- Tornadoes — recent touchdowns plus active watches and warnings
- Wildfires — active fires, acreage, containment percent, communities at
  risk, smoke plume direction and downwind air-quality impact
- Floods — river levels, evacuation orders, road and highway closures
- Winter storms / blizzards — snow totals, ice accretion, dangerous wind
  chills
- Severe thunderstorm outbreaks — derecho risk, damaging-wind and hail
  watches
- Atmospheric rivers / extreme precipitation events
- Drought conditions — current state by region, agricultural and water-
  supply impact

ACTIVE ADVISORIES (always cover when issued):
- Excessive heat warnings, heat advisories
- Extreme cold and wind-chill advisories
- Air quality alerts (especially wildfire smoke and ozone)
- Power grid stress warnings (ERCOT, CAISO, MISO, etc.)
- Coastal flood and storm surge warnings

WORKER / CLIMATE / EQUITY ANGLE:
- Name the risks to outdoor workers during heat or cold extremes —
  construction, agriculture, delivery, warehouse loading, fast food,
  sanitation, postal carriers
- Note the lack of a federal OSHA heat standard, where relevant
- Spell out who is hit hardest: poor, elderly, unhoused, immigrant
  communities, disabled people, families without reliable cooling or
  heating
- When extreme weather events fit a known climate-change pattern, name
  the pattern — without moralizing, without speculating beyond the
  science

PRACTICAL DAILY-LIFE IMPACT (mention briefly when significant):
- Major airport delays or closures (ATL, ORD, JFK, LAX, DFW, DEN, SFO, MIA)
- Interstate or major highway closures, dangerous travel conditions
- School closures in affected metros
- Public transit disruptions (subways, buses, regional rail)

SEASONAL / CONTEXTUAL FRAMING:
- Hurricane season runs June 1 through November 30 — note proximity,
  named-storm counts, NOAA seasonal forecasts when material
- Wildfire season is active across much of the West most of the year now
  — flag dangerous red-flag warnings and burn bans
- ENSO state (El Niño / La Niña / neutral) — only when it's a meaningful
  driver of the day's pattern

TONE:
- The weather sections should sound like a useful, calm, modern morning
  briefing — not a TV anchor reading numbers. The host's job is to
  translate forecast data into "what does this mean for me, today, and
  the people I care about."
- Skip categories with nothing meaningful to add — say so briefly and
  move on. Don't pad.

RIDDLE SECTION REQUIREMENT:
Include one short, clever, family-safe riddle near the end of the episode.
- Keep it light and fun.
- Present the riddle in its own short section.
- Do NOT reveal the answer immediately.
- Reveal the answer after the outro or in a final “riddle answer” tag at the very end of the script.

ELEVENLABS FORMATTING REQUIREMENT:
- The spoken script must be formatted for direct paste into ElevenLabs.
- Do NOT describe the voice.
- Do NOT include voice identity instructions.
- Do NOT include production notes inside the spoken script.
- Do NOT include music cues inside the spoken script.
- Use short spoken lines, strong punctuation, and natural sentence breaks.
- Avoid giant text blocks.
- Use commas and periods to control pacing.
- Use paragraph spacing intentionally to improve phrasing and breath.
- The script must read naturally even without any special tags.
- If helpful, use sparse inline bracketed delivery markers for pacing and tone only, such as:
  [pause]
  [gentle pause]
  [beat]
  [reflective pause]
  [lower]
  [firmer]
  [warmly]
- Use these sparingly.
- Do NOT overload every paragraph with tags.

ELEVENLABS VOICE OPTIMIZATION:
- Break ALL writing into short spoken lines.
- Each line should contain one clear idea.
- Use vertical spacing to control pacing.
- Important lines should stand alone.
- Avoid dense paragraphs.
- Write for spoken cadence, not article prose.
- Shorter lines should slow delivery.
- Longer lines may carry transitions.
- Use contrast framing when useful.

Example:
Corporate profits are rising.

Wages are not.

[beat]

That gap is the story.

SECTION SPACER RULE:
- After EVERY major section, insert a standalone spacer marker line:
  [TEN-SECOND SECTION SPACER]
- This marker is for pacing guidance and/or post-production editing.
- Do NOT write spoken filler during this spacer.
- Do NOT replace the spacer with music notes.
- Treat the spacer as a silent gap marker between sections.
- If the generation target can interpret pause-style tags, keep the spacer marker exactly as written.
- If the audio workflow does not honor a full ten-second pause automatically, this marker should still remain in the script so the silence can be added in editing.

WRITING STYLE:
- Sound like a polished morning news podcast for a smart general audience, but with a sharper anti-capitalist and progressive edge.
- Make the script smooth, modern, clear, and natural when spoken aloud.
- Do not just list headlines.
- Build a full narrative arc across the episode.
- Use strong transitions between sections.
- Briefly explain why each story matters.
- Keep the tone professional, confident, grounded, readable, morally clear, and punchy.
- Avoid bland both-sides framing when power is clearly asymmetric.
- Avoid sensationalism, melodrama, cable-news theatrics, robotic phrasing, and vague liberal mush.
- Make the script feel like one complete morning briefing, not a disconnected stack of summaries.

OUTPUT FORMAT FOR API:
Return strict JSON only.
Do not wrap JSON in markdown.
Do not include commentary outside the JSON.

The JSON must include:
- show_title
- episode_date
- source_date
- estimated_runtime
- elevenlabs_script
- riddle_question
- riddle_answer
- social_copy
- source_notes
- self_validation

ELEVENLABS-READY SPOKEN SCRIPT OUTPUT RULES:
- The spoken script must contain no music cues.
- The spoken script must contain no production notes.
- The spoken script must contain no voice-description notes.
- The spoken script must be ready to paste directly into ElevenLabs.
- The spoken script must begin with “Good morning, today is [CURRENT DATE].”
- The spoken script must be written as a real host read, not a bullet summary.
- The spoken script MUST be 2,175–2,465 words. Target: 2,200–2,400 words.
- Scripts outside this range are automatically rejected. Verify word count before submitting.
- Insert [TEN-SECOND SECTION SPACER] between each major section.

TRANSITIONAL PHRASES (vary across the episode):
- After every [TEN-SECOND SECTION SPACER], the host MUST introduce the
  next section by name with a brief transitional phrase.
- The transition phrase MUST appear AFTER the spacer marker, never before it.
  The spacer is a silent gap in audio — a sting sound plays over it.
  The first words the listener hears after the sting are the transition.
- Required format for every section transition:

    [end of previous section content]

    [TEN-SECOND SECTION SPACER]

    [Transition phrase], [Section Name].

    [Section content begins here...]

- Example:
    ...that is the situation on the ground in Gaza.

    [TEN-SECOND SECTION SPACER]

    Up next, the Riddle.

    Here is this morning's riddle...

- VARY the transitional phrases across the episode — do NOT use the same
  phrase twice in a single show. Pick from this list at random for each
  section transition (or invent close variants in the same register):
  1.  "Now we go to..."
  2.  "Onto..."
  3.  "Forward to..."
  4.  "Up next..."
  5.  "Let's turn to..."
  6.  "Moving on to..."
  7.  "Coming up next..."
  8.  "Now, let's look at..."
  9.  "Time for..."
  10. "Here's..."
  11. "Let's shift to..."
  12. "Next on the show..."
  13. "Turning to..."
  14. "And now..."
  15. "Stepping into..."
  16. "Switching gears to..."
  17. "Let's pivot to..."
  18. "Up first today,..."
  19. "Let's spend a few minutes on..."
  20. "Heading into..."
- Each transition is exactly one sentence: phrase + section name + period.
    "Up next, the Power Map."
    "Let's turn to our Cost of Living Check."
    "Time for What Comes Next."
    "Now we go to today's riddle."
- Do not stack two transitional phrases together. One per section.
- Do not put any transitional phrase BEFORE the spacer marker.
- The very first section after the opening does not need a transition phrase.

SECTION LABELS — when to speak, when to silence:
- DO speak each section's name as the host introduces it. Saying the
  section name out loud helps listeners orient, and pairs naturally with
  the sting transitions between sections. Use a brief, natural intro
  sentence such as:
  - “Now, the Power Map.”
  - “Up next, our Cost of Living Check.”
  - “Here's What Comes Next.”
  - “Time for today's riddle.”
  - “And our positive closing story for the day.”
- DO NOT speak the production-only labels:
  - The literal word “Outro” — instead, end with a natural sign-off
    (“Thanks for joining me on The Morning Cup. We'll see you tomorrow.”).
    Record the outro CONTENT, just never the word “outro.”
  - “Section spacer” or “[TEN-SECOND SECTION SPACER]” — this marker is a
    silent gap in audio, never voiced. Do not write any spoken text on
    the spacer line.
  - “Riddle answer:” as a colon-style heading — instead introduce it
    naturally (“And the answer to this morning's riddle is…”).
- DO NOT write all-caps headings, label-style lines, or production
  bracketed labels like “OUTRO:” or “POWER MAP —“ inside the spoken
  script. Section intros should be written as full spoken sentences.

PDF REQUIREMENT:
- The application code will generate the clean PDF/HTML-ready version by removing pacing tags and spacer markers from the ElevenLabs script.
- Do not generate a second full rewritten script for PDF unless explicitly requested.

SOCIAL COPY REQUIREMENT:
- Write one tweet-style post summarizing the full episode.
- Write one tweet-style post for each major section.
- Keep the posts sharp, clean, platform-ready, and aligned with the leftist, working-class-centered editorial lens.

CHAPTERS REQUIREMENT:
- Output a chapters array with one entry for every major section that appears in elevenlabs_script.
- The chapters must be in the same order as the [TEN-SECOND SECTION SPACER] markers — so the count of chapters MUST equal the number of spacer-separated sections.
- Each chapter has:
  - title: a short clear name listeners will see in their podcast app (e.g. "Positive Opening", "U.S. Politics", "Power Map", "Crime", "Immigration", "Cost of Living Check", "Healthcare", "Climate", "International", "Riddle", "Closing Story", "What Comes Next", "Closing Summary", "Riddle Answer").
- Use Title Case for chapter titles.
- Keep titles under 40 characters.
- Do NOT include section numbers in the title.
- Do NOT add chapters that are not in the script.
- Do NOT skip sections.
- The build pipeline writes these as MP3 ID3 chapter markers so listeners can jump between sections in Apple Podcasts, Overcast, Spotify, etc.

FINAL REQUIREMENT:
The full episode should feel like one complete morning briefing with a clear emotional and editorial arc:
- start warm and welcoming
- move through the most important and difficult news in a logical order
- analyze who holds power and who pays the price
- include political race updates, political trend analysis, immigration updates, crime headlines, and positive science/oceans/environment news when relevant
- include a short riddle near the end and reveal the answer at the very end
- be formatted for ElevenLabs-ready narration
- produce a host-read script that is ALWAYS at least 15 minutes and NEVER longer than 17 minutes
- include [TEN-SECOND SECTION SPACER] between all major sections
- end grounded, constructive, and positive`;

export interface PromptInputs {
  episodeDateSpoken: string; // e.g. "May 1, 2026"
  sourceDateSpoken: string; // e.g. "April 30, 2026"
  sourceDigestText: string;
  sourceLimited: boolean;
  hostName: string; // e.g. "Penelope Rose"
  recentTopics?: { chapters: string[]; stories: string[] };
}

export function buildUserPrompt(inputs: PromptInputs): string {
  const supplementalDigest =
    inputs.sourceDigestText && inputs.sourceDigestText.length > 100
      ? `\nSUPPLEMENTAL CONTEXT (starting hints only — verify and expand with web_search before relying on any item):\n${inputs.sourceDigestText}\n`
      : "";

  const recentTopicsBlock =
    inputs.recentTopics && inputs.recentTopics.stories.length > 0
      ? `\nRECENT STORIES (past 7 days — do NOT re-cover these same stories; choose fresh angles or entirely different news):\n${inputs.recentTopics.stories.map((s) => `- ${s}`).join("\n")}\n`
      : "";

  return `HOST: ${inputs.hostName}
CURRENT DATE (episode_date): ${inputs.episodeDateSpoken}
SOURCE DATE (previous day to summarize): ${inputs.sourceDateSpoken}

⚠️ MANDATORY LENGTH REQUIREMENT — READ BEFORE WRITING ANYTHING:
The elevenlabs_script field MUST contain 2,200–2,400 spoken words. Hard floor: 2,175. Hard ceiling: 2,465.
At 145 words/minute: 2,200 words = 15.2 min. 2,400 words = 16.6 min.
Before returning JSON, count the words in your script. If under 2,175, EXPAND. If over 2,465, TRIM.
Scripts outside this range are REJECTED and waste money on repair passes. Hit the range on the first try.
${recentTopicsBlock}
RESEARCH INSTRUCTIONS:
You have a web_search tool available. You MUST use it to research the actual news from ${inputs.sourceDateSpoken}. Run multiple targeted searches across the topic flow:
- A genuine positive opening story (rescue, mutual aid, labor wins, conservation, ordinary people doing something kind)
- Major U.S. politics and political-trend developments
- National crime headlines, immigration, California governor's race, House/Senate primaries
- Business, economy, trade, technology
- Healthcare, climate, positive science / ocean / conservation
- International, Iran, Gaza
- Any meaningful social/culture conversation

Pull facts from credible outlets (Reuters, AP, NYT, CNN, BBC, Guardian, NPR, Democracy Now, Jacobin, The American Prospect, Truthout, and other independent / leftist reporting where it strengthens the editorial lens). Cite real source URLs in source_notes. If web_search returns nothing meaningful for a category, say so briefly in the script and move on — do NOT invent or fabricate facts under any circumstance.

Do NOT preface the script with a disclaimer about source availability or describe the script as a draft. Open with "Good morning, today is ${inputs.episodeDateSpoken}." and proceed directly into the show.
${supplementalDigest}
Return STRICT JSON ONLY. No markdown. No commentary.`;
}
