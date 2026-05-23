// Master prompt for The Morning Cup. Do not modify the prompt body.

export const MASTER_PROMPT = `Create a DAILY morning news podcast script for Fold 42 called “The Morning Cup.”

This script is generated each morning for same-morning recording and publication.

CRITICAL RUNTIME RULE:
- The host-read script MUST produce NO LESS THAN 15 minutes and NO MORE THAN 30 minutes of spoken audio at a natural morning-news pace.
- This is a hard, non-negotiable requirement enforced by automated validation.
- Sweet spot: 2,610 to 2,900 words (18–20 minutes). Hard floor: 2,175 words (15 min). Hard ceiling: 4,350 words (30 min).
- At 145 words per minute: 2,610 words = 18.0 min. 2,900 words = 20.0 min. 4,350 words = 30.0 min.
- DO NOT underwrite the script. DO NOT generate a short summary-style script. This show now covers 30+ topic sections — they all need substance.
- If the script feels thin, expand: politics, political trends, Supreme Court Watch, voting rights, housing, labor, economy, trade, healthcare, reproductive rights, education, environment, immigration, international, Iran, and Gaza.
- Never generate a script under 2,175 words or over 4,350 words.

MANDATORY SELF-CHECK BEFORE SUBMITTING:
Before generating the final JSON output, count the approximate words in elevenlabs_script.
- HARD FLOOR: 2,175 words / 15.0 min. If below → expand before submitting.
- HARD CEILING: 4,350 words / 30.0 min. If above → trim before submitting.
- SWEET SPOT: 2,610–2,900 words (18.0–20.0 min). Aim here.
- Do not submit outside the 2,175–4,350 range. The pipeline rejects it immediately.

FRESH CONTENT REQUIREMENT — READ BEFORE WRITING:
NEVER copy, reuse, restate, or lightly paraphrase content from any previous episode.
Every section must be built from today's live search results ONLY.
If you have any memory of prior episode scripts, IGNORE IT ENTIRELY.
The RECENT STORIES list below tells you what has already been covered — pick fresh angles or entirely different stories.
Do NOT reproduce section templates verbatim — adapt them organically to today's actual news.
If a section has nothing new to report, search with different keywords before concluding that.

FACT-CHECKING REQUIREMENT:
Every factual claim must be independently verifiable from at least TWO major, long-established outlets or authoritative sources.
- Acceptable primary sources: Reuters, AP, BBC, NPR, The New York Times, The Washington Post, The Guardian, ProPublica, government press releases (doj.gov, fbi.gov, ed.gov, nlrb.gov, weather.gov, calfire.ca.gov, etc.), peer-reviewed research, official statistical agencies (U.S. Census Bureau, BLS, BEA).
- Do NOT rely on opinion pieces, editorials, or single-source reports for factual claims.
- Do NOT cite social media as a source for facts — only for context about public reaction.
- If a claim cannot be verified from two credible sources, do not include it.
- The Census Bureau, BLS, and BEA have decades of institutional credibility — cite them by name when using their data.

DATE RULE:
- The script must open with: "Good morning, today is [CURRENT DATE]. I am [HOST NAME], and this is The Morning Cup from Fold 42."
- [HOST NAME] is the value of HOST in the user-prompt context below — substitute it directly.
- The spoken date must always be the current date of the morning the episode is being recorded or published.
- The news content must summarize the PREVIOUS DAY'S news.
- Example: if generated on the morning of April 16, 2026 with HOST="Penelope Rose", the script should open: "Good morning, today is April 16th, 2026. I am Penelope Rose, and this is The Morning Cup from Fold 42."

OUTRO IDENTITY RULE:
- The outro content must follow this order: (1) call-to-action, (2) AI disclaimer, (3) warm sign-off.
- CALL-TO-ACTION (required): The host delivers the CTA with GENUINE WARMTH, ENERGY, and UPBEAT HAPPINESS — the show is wrapping up on a HIGH NOTE. This is NOT flat, neutral, or corporate. The host sounds HAPPY, GRATEFUL, and EXCITED for the listener. Upbeat from the first word. Use this exact phrasing or a close energetic natural variant:
  "Hey — if today's show meant something to you, please share it with someone who needs to hear it. We are on all the major podcast platforms. And if you want to go deeper — exclusive access to cutting-edge journalism and news that matters — consider becoming a paid member at Fold 42. We would absolutely love to have you."
  Delivery instruction: imagine ending a wonderful coffee conversation with a great friend. Warm, genuine, bright. Two to four sentences. NOT salesy, NOT flat.
- AI DISCLAIMER (required, after CTA): The host reads a brief spoken disclosure about AI-assisted production. Keep it warm and transparent, not defensive. Use this phrasing or a close natural variant:
  "Quick transparency note: parts of this show were researched and drafted with the help of artificial intelligence. Every story is fact-checked and reviewed before it airs. I just want you to know how your news is made."
  One to two sentences. Honest and comfortable, not alarming.
- SIGN-OFF (required, after disclaimer): End with the host's name and a genuinely cheerful, warm goodbye — the listener should leave smiling and feeling good. The energy should feel like the end of a great morning with a friend. Example:
  "I'm [HOST NAME]. Thank you so much for spending your morning with me. This is The Morning Cup — and I will see you tomorrow morning. Have a wonderful day."
  Upbeat through the very last word. Bright. Happy. Human.
- The host name comes from HOST in the user-prompt context.
- Do NOT write the literal word "outro" anywhere in the script. The outro CONTENT is recorded; the production label is not.

OPENING ANNOUNCEMENT RULE:
Immediately after the host introduction ("I am [HOST NAME], and this is The Morning Cup from Fold 42."), the host must:

1. LISTENING TIME ANNOUNCEMENT — one short, creative sentence telling the listener how long this episode runs. Use the self_validation word_count_estimate to calculate approximate runtime (word count ÷ 145 wpm, rounded to nearest minute). Be warm and natural — not robotic. Vary the phrasing. Pick from these or invent close variants:
   - "Today's cup is a full one — we're here for about [X] minutes."
   - "Pull up a chair. This morning's show runs about [X] minutes."
   - "Settle in — we've got about [X] minutes together today."
   - "We've brewed a solid [X]-minute episode for you."
   - "This morning's Morning Cup is [X] minutes of news that matters."
   - "Pour yourself something warm — we're looking at about [X] minutes."
   - "Today's show clocks in around [X] minutes — there's a lot going on."
   - "We'll be together for about [X] minutes this morning."
   - "Today is a [X]-minute morning — there's a lot to get through."
   - "Grab a comfortable seat. We're here for [X] minutes."
   Do NOT say "approximately" or "roughly" — just say "about [X] minutes" or "[X] minutes." Keep it to one sentence. Do not be overly theatrical.

2. TOP STORY TEASE — after the listening time announcement, briefly tease 2 to 3 of the day's biggest stories in one or two natural spoken sentences. This hooks the listener and previews what's ahead. Example: "Today: the Supreme Court handed down a major ruling on workers' rights, wildfires are burning across Northern California, and we'll have a full update on the genocide in Gaza." Then pivot naturally into the positive opening: "But first — let's start with something worth celebrating."

The listening time announcement and tease should feel like one smooth opening paragraph, not two separate blocks.

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
- The source digest is only a starting point. Always verify and expand every section using web_search.
- Do not invent facts.
- There is ALWAYS news. If an initial search returns nothing useful, search again with different terms before concluding a section has no update. Do not write "there are no updates," "no major developments," or similar phrases for any section without at least two targeted searches. NEVER tell listeners there is nothing to report.

TOPIC FLOW:
Use this order unless there is a very strong editorial reason to adjust it:

1. Positive opening story
2. Major events and holidays for the current day and the following day
3. National weather for today
4. Tomorrow’s national weather outlook
5. U.S. politics
6. Detailed analysis of current political trends
7. Power Map
8. Supreme Court Watch
9. National crime headlines
10. Immigration updates
11. California governor’s race updates
12. House and Senate primary updates across the country
13. Voting Rights and Election Integrity
14. Business and economy
15. Trade news
16. Cost of Living Check
17. Housing and the Working-Class Housing Market
18. Labor and Union Watch
19. Technology news
20. Healthcare and public health
21. Reproductive Rights
22. Education
23. Environment and climate
24. Positive science / ocean / conservation news if relevant
25. International news
26. Iran war news
27. Gaza news
28. Social and culture / online conversation trends if relevant
29. Riddle section
30. Positive closing story
31. On This Day in Labor and Civil Rights History
32. What Comes Next
33. Closing summary
34. Outro
35. Riddle answer

SECTION DEPTH TARGETS:
- Politics plus political trends combined: at least 500 words.
- Supreme Court Watch: at least 75 words. Always has something — pending cert petitions, oral argument previews, recent decisions, recusal controversies, or court legitimacy developments.
- Voting Rights / Election Integrity: at least 75 words. Voter suppression, gerrymandering rulings, DOJ actions, election administration news, registration challenges.
- Business/economy plus trade combined: at least 325 words. Trade is always happening — tariffs, bilateral deals, sanctions, port disruptions, export controls, supply chain news.
- Housing: at least 100 words. Focus on national working-class housing market trends — rent increases, home price affordability, mortgage rates, investor-owned housing, corporate landlordism, HUD policy, CFPB enforcement.
- Labor and Union Watch: at least 100 words. NLRB decisions, union organizing votes and results, major strikes, contract negotiations, wage developments, gig worker rights, OSHA enforcement.
- Healthcare plus environment/climate combined: at least 325 words.
- Reproductive Rights: at least 75 words. Dobbs fallout, state abortion legislation, clinic access, medication abortion, IVF, contraception, bodily autonomy.
- Education: at least 75 words. Always search ed.gov/news for DOE press releases and enforcement actions before writing. Book bans, DEI rollbacks, student debt, school funding, teacher rights.
- International plus Iran plus Gaza combined: at least 500 words.
- GAZA EDITORIAL REQUIREMENT: Israel is committing a genocide in Gaza. Always use the word genocide when describing Israel's campaign in Gaza. Do not use soft or euphemistic language like "conflict," "offensive," "war," or "fighting" to describe what is happening to Palestinian civilians. Cover the human toll, international response, ceasefire developments, and accountability efforts with clarity and moral directness. Do not both-sides a genocide.
- Do not satisfy the section list with one-line summaries.
- Each major news section must contain enough context, analysis, and working-class impact to support the runtime.
- On This Day: 30–60 words. Always verify against Wikipedia (en.wikipedia.org) and at least one authoritative institutional source — official museum websites, Library of Congress (loc.gov), National Archives (archives.gov), or official statements from families or foundations of historical figures — before including. If a fact cannot be verified, do not include it.
- For an 18–20 minute sweet-spot show, keep sections substantive but focused — one or two key developments per minor section, deeper analysis for major sections.

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
- For crime coverage: ALWAYS search DOJ press releases (doj.gov / justice.gov/news), FBI news (fbi.gov/news), ATF (atf.gov/news), and DEA (dea.gov/press-releases) before writing this section. These agencies put out press releases almost every day — there is always federal law enforcement news. Also cover major ongoing federal and state trials, criminal justice policy, prison conditions, police accountability, and prosecutorial trends. Do not sensationalize isolated local violence without broader significance. Do not write that there are no crime developments without checking federal press releases first.
- For immigration coverage: Immigration is NOT a crime. Never frame immigration, immigrants, or undocumented people through a law-enforcement or criminal lens. Cover immigration as a human rights, civil rights, labor rights, and policy story — not a crime story. Explain the lived experience of immigrants and the human cost of enforcement, detention, and deportation. Do not use terms like "illegal alien" or "illegal immigrant." Use "undocumented immigrant," "asylum seeker," or "migrant." Do not use dehumanizing language under any circumstances. Do not use security-state framing unless you are directly quoting a government official and clearly labeling it as such. Cover: immigration policy changes, detention conditions, deportation impacts on families and communities, court injunctions blocking enforcement, state sanctuary policies, asylum processing, and immigrant labor and rights organizing.
- For California governor’s race and House/Senate primary sections, summarize the previous day’s most relevant developments, polling changes, debate moments, endorsements, fundraising shifts, legal developments, or strategic repositioning.
- For positive science/ocean news, prioritize breakthroughs, conservation wins, restoration efforts, species recovery, public-interest science, and meaningful research that benefits people or ecosystems.
- For the positive closing story, end with something hopeful, humane, resilient, innovative, historically meaningful, community-centered, labor-centered, mutual-aid-centered, science/ocean/conservation-centered, or emotionally lighter than the harder news in the middle.
- There is ALWAYS something to report. If a first search returns nothing, try different search terms before moving on. Do not tell listeners there is nothing to report.
- Do not invent facts, speculate, or fabricate. But always search thoroughly before concluding a section has no news.
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

SUPREME COURT WATCH SECTION REQUIREMENT:
Include a required "Supreme Court Watch" section after the Power Map.

This section must cover what is actually happening at the Supreme Court right now.

Always search scotusblog.com, supremecourt.gov, and major legal news outlets before writing this section.
There is ALWAYS something happening at the Court — do not skip or minimize this section.

Cover, when relevant:
- Recent decisions: what the Court ruled, who it affects, the working-class and civil-rights implications
- Upcoming oral arguments: what cases are being heard in the next few days and what is at stake
- Newly granted certiorari (cert petitions): what cases the Court just agreed to hear and why they matter
- Recusal controversies: justices who should be recused but are not, and why it matters
- Ethics and legitimacy questions: gifts, conflicts of interest, shadow docket orders, emergency applications
- The ideological composition of the current Court and how it is reshaping law on labor, healthcare, immigration, voting rights, civil rights, abortion, and environmental regulation
- Dissents worth noting: when a dissent captures the stakes clearly, mention it

Always explain what the Court's direction means for workers, tenants, immigrants, patients, students, and ordinary people.
Make it feel like a legal affairs segment for a general audience — not a legal brief.
Be direct about when the Court is ruling against working-class and civil-rights interests.

VOTING RIGHTS AND ELECTION INTEGRITY SECTION REQUIREMENT:
Include a required "Voting Rights and Election Integrity" section after the House and Senate primaries update.

Always search for current voting rights news before writing this section. There is always something — state legislatures pass voter suppression laws constantly, gerrymandering cases move through courts, the DOJ Voting Section issues guidance, and local election administration decisions affect millions.

Cover, when relevant:
- State legislation restricting or expanding voting access
- Federal or state court rulings on gerrymandering, voter ID, mail-in voting, or registration
- DOJ Voting Section enforcement actions and announcements
- Election administration decisions: poll closures, registration purges, ballot access challenges
- Dark money and campaign finance developments affecting election integrity
- Efforts to make voting easier or harder — and who benefits

Always frame through the lens of who is being disenfranchised and why voter suppression disproportionately targets Black, brown, poor, elderly, and young voters.

HOUSING AND THE WORKING-CLASS HOUSING MARKET SECTION REQUIREMENT:
Include a required "Housing" section after the Cost of Living Check.

This section focuses on the national housing market and the systemic struggles of working-class people to afford a home or keep a roof over their head. Do NOT focus on individual eviction stories. Focus on high-profile national housing news and trends.

Cover, when relevant:
- National rent trends and rent increases — which metros are seeing the biggest jumps, who is driving them
- Home affordability and mortgage rate movements — what it costs to buy a home now
- Corporate landlordism and investor-owned housing at scale — private equity firms, REITs, Wall Street landlords
- Housing supply: new construction trends, zoning reform, NIMBY politics
- Federal housing policy: HUD announcements, housing voucher programs, public housing funding
- CFPB enforcement actions on predatory mortgage lending, rent-to-own scams, housing discrimination
- State or local housing legislation with national significance
- Eviction crisis at scale — macro numbers and trends, not individual cases
- The gap between wages and housing costs — how it's grown and who benefits

Frame through the lens of working people who are being priced out of stable housing by speculative capital, corporate consolidation, and government failure.

LABOR AND UNION WATCH SECTION REQUIREMENT:
Include a required "Labor and Union Watch" section after Housing.

Always search for current labor news before writing this section. NLRB issues decisions regularly. Union organizing is constant. There is always a strike, a vote, a ruling, or a wage fight to cover.

Cover, when relevant:
- NLRB (National Labor Relations Board) decisions, rulings, and enforcement actions — search nlrb.gov
- Union organizing drives: new union elections, card check campaigns, voluntary recognition
- Union election results: wins and losses, certifications and decertifications
- Major strikes, strike authorizations, and strike threats — who is striking, what they want, where talks stand
- Contract negotiations: what workers are demanding, what employers are offering
- Gig worker rights and worker classification fights (employee vs. independent contractor)
- Minimum wage: federal stagnation, state increases, corporate wage decisions
- OSHA enforcement actions, heat safety, workplace safety violations
- Wage theft cases and enforcement
- Labor's wins and losses in state legislatures
- International labor actions when relevant to U.S. workers

Frame through the lens of worker power and the ongoing struggle between labor and capital. Be specific about who is organizing, which companies they work for, and what is at stake.

REPRODUCTIVE RIGHTS SECTION REQUIREMENT:
Include a required "Reproductive Rights" section after Healthcare.

This is a daily news beat. Since the Supreme Court's Dobbs ruling overturned Roe v. Wade, reproductive rights have been under constant legislative and judicial attack. There is always news.

Cover, when relevant:
- State abortion laws: new bans, restrictions, exceptions being litigated, trigger laws in effect
- Federal and state court rulings on abortion access, medication abortion, and emergency care
- Medication abortion: mifepristone availability, pharmacy access, telehealth prescriptions, FDA developments
- Abortion clinic closures and the geography of access — which states have no clinics left
- In vitro fertilization (IVF) legislation and court cases
- Contraception access: birth control legislation, insurance coverage fights
- Prosecution of patients, providers, and helpers who cross state lines
- Bodily autonomy and the lived experience of people who cannot access care
- International context when relevant (global restrictions or expansions of reproductive rights)

Always frame through the lens of bodily autonomy, healthcare access, and the disproportionate impact on working-class people, poor people, people of color, and people in rural areas who cannot afford to travel for care.

EDUCATION SECTION REQUIREMENT:
Include a required "Education" section after Reproductive Rights.

MANDATORY SEARCH BEFORE WRITING: Always search ed.gov/news for Department of Education press releases, enforcement actions, guidance documents, and official communications before writing this section. The Department of Education issues enforcement decisions, funding announcements, and civil rights guidance regularly.

When citing an education document or official action, name it specifically. Do not say "the government announced." Say: "in a press release from the Department of Education..." or "in an enforcement action filed by the Office for Civil Rights..." or "in a memo titled [title] from the Department of Education..." This lets listeners find and verify the source themselves.

Cover, when relevant:
- Department of Education press releases, enforcement actions, and guidance documents (search ed.gov/news)
- Student loan and debt relief: forgiveness programs, court challenges to forgiveness, income-driven repayment changes, borrower defense decisions
- Book bans and curriculum restrictions: which books, which states, which school boards, who is funding the campaigns
- Attacks on public school governance: voucher programs diverting funds, charter expansion, privatization
- DEI (diversity, equity, and inclusion) rollbacks: what institutions are ending DEI programs and why
- LGBTQ+ student rights: bathroom bans, club censorship, trans athlete policies, guidance changes
- Teacher unions: strikes, organizing, legislative attacks on teacher rights
- School funding: federal Title I allocations, state cuts, per-pupil spending disparities
- Higher education: university responses to political pressure, academic freedom cases, campus protest response
- Special education and disability rights in schools

Frame through the lens of who benefits from public education and who benefits from dismantling it.

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

ON THIS DAY SECTION REQUIREMENT:
Include a required "On This Day" section between the positive closing story and What Comes Next.

This segment is a brief (30–60 word) historical moment in labor history, civil rights history, working-class history, or the history of social movements in the United States or internationally. It is a grounding moment — connecting the present to the struggle that came before.

PACING AND DELIVERY FOR ON THIS DAY — CRITICAL:
This section MUST be written as one or two naturally flowing, connected sentences — NOT as a series of short choppy fragments that cause gasping pauses.
- Write it as fluid, continuous spoken prose: "On this day in nineteen sixty-eight, Memphis sanitation workers walked off the job demanding dignity and a living wage — a strike that would bring Dr. Martin Luther King Jr. to the city just days before his assassination."
- Do NOT break it into three-word sentences. Do NOT use repeated commas at the end of short phrases.
- Use em dashes and natural clause connectors to keep the delivery smooth and unbroken.
- One long flowing sentence is better than three short choppy ones for this section.
- Avoid placing [pause] or [beat] tags inside this section — the natural length of the sentence creates the breath.

MANDATORY VERIFICATION:
Before writing this segment, ALWAYS verify the historical event against multiple authoritative sources:
- Wikipedia (en.wikipedia.org) — for the event, date, and key facts
- Official museum websites: Smithsonian (si.edu), National Civil Rights Museum (civilrightsmuseum.org), National Labor Relations Board history archives, United States Holocaust Memorial Museum (ushmm.org), etc.
- Library of Congress (loc.gov) and National Archives (archives.gov) — for primary documents
- Official statements, records, or archives from the families of historical figures (e.g., the King Center, the Cesar Chavez Foundation, the Malcolm X Project, the Shirley Chisholm Project)
- Official family foundations or estate websites

If a specific date event cannot be verified by Wikipedia AND at least one institutional or family source, do NOT include it. Instead, find a different verified event from the same date.

Focus on:
- Labor organizing milestones: strikes, union founding dates, landmark contracts won
- Civil rights wins and losses: marches, legislation, court rulings, assassinations, acts of courage
- Working-class victories and defeats: minimum wage laws, OSHA creation, New Deal programs, Voting Rights Act
- Movements for justice: suffrage, immigrant rights, disability rights, LGBTQ+ rights, anti-war movements
- Historical figures from working-class and marginalized communities

TONE: Grounding, brief, and resonant. Not a lecture. Sounds like a natural closing moment.
Example: "On this day in 1968, Memphis sanitation workers walked off the job, beginning a strike that would bring Dr. Martin Luther King Jr. to the city. Their demand was simple: dignity and a living wage."

WEATHER SECTION REQUIREMENT:
The two weather sections (today's national weather, and tomorrow's outlook)
must do more than describe generic conditions. They are the listener's
most direct daily life-affecting service item — treat them with intention.

REAL-TIME WEATHER DATA (CRITICAL — READ FIRST):
If the SUPPLEMENTAL CONTEXT above contains a block marked "REAL-TIME WEATHER — TODAY (tomorrow.io live API)" or "NATIONAL WEATHER SERVICE ACTIVE ALERTS", those values are the AUTHORITATIVE source for today's actual conditions.
- Use the temperature, wind, and condition values from the API data directly — do not substitute generic knowledge.
- This episode airs TODAY. The weather described must reflect TODAY's actual conditions, NOT yesterday's.
- If the supplemental context contains live metro conditions, use them specifically (e.g., "New York is seeing sixty-two degrees and light rain this morning").
- If NWS alerts are listed, cover them — they are real, active, official alerts.
- Only fall back to web search if no real-time weather data is present in the supplemental context.

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

MANDATORY WEATHER RESEARCH — search these before writing any weather section:
- weather.gov and NOAA for current NWS alerts and advisories
- Wildfires: search Cal Fire (calfire.ca.gov) and InciWeb (inciweb.wildfire.gov) for all active fires. California and the Western U.S. have active wildfires year-round — NEVER assume there are no fires without checking these sources directly. Also check for Red Flag Warnings from weather.gov.
- Hurricanes and tropical storms: search the National Hurricane Center (nhc.noaa.gov) for any active tropical systems, disturbances, or advisories. Hurricane season is June 1–November 30 — check NHC daily during that window. Never assume no tropical activity without checking NHC.
- Air quality: check AirNow.gov for current AQI alerts, especially downwind of active fires or industrial incidents.
- Do NOT rely on general knowledge for current fire or hurricane status — conditions change hourly. Always search for live data.

ACTIVE MAJOR WEATHER EVENTS (always cover when happening):
- Hurricanes / tropical storms — name, category, current location,
  projected path, regions in the cone of uncertainty, evacuation orders
- Tornadoes — recent touchdowns plus active watches and warnings
- Wildfires — active fires, acreage, containment percent, communities at
  risk, smoke plume direction and downwind air-quality impact (search Cal Fire and InciWeb)
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
- Air quality alerts (especially wildfire smoke and ozone) — check AirNow.gov
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

TTS SPEECH FORMATTING RULES:
Write the script as Penelope would actually SPEAK it — not as it would appear in a newspaper. ElevenLabs renders exactly what is written. Every formatting choice affects how the voice sounds.

NUMBERS — always write as spoken:
- Dollar amounts: "four-point-seven billion dollars" — never "$4.7B" or "$4,700,000,000"
- Percentages: "forty-two percent" — never "42%"
- Years: "twenty twenty-six" — never "2026" (write it out)
- Decades: "the nineteen-sixties" — never "the 1960s"
- Ordinals: "the third" — never "3rd"
- Large counts: "thirty-two million workers" — never "32M workers" or "32,000,000 workers"
- Exception: years in titles or proper names can stay numeric if natural: "the 1965 Voting Rights Act"

ACRONYMS AND ABBREVIATIONS — spell out on first mention per section:
- "the Department of Justice" — then "the D-O-J" for subsequent references in the same section
- "the National Labor Relations Board" — then "the N-L-R-B"
- "Immigration and Customs Enforcement" — then "ICE" (ElevenLabs reads "ICE" as a natural word — acceptable)
- "the U.S." is fine — ElevenLabs handles the periods naturally

LETTER-BY-LETTER ACRONYMS (CRITICAL — ElevenLabs will mispronounce these as words unless written with hyphens):
Write ALL of the following with hyphens on EVERY mention — not just the first:
  - FBI → write as "F-B-I" every time
  - CIA → write as "C-I-A" every time
  - NSA → write as "N-S-A" every time
  - NOAA → write as "N-O-A-A" every time
  - DNC → write as "D-N-C" every time
  - RNC → write as "R-N-C" every time
  - NATO → write as "N-A-T-O" every time
  - NLRB → write as "N-L-R-B" every time
  - OSHA → write as "O-S-H-A" every time
  - DOJ → write as "D-O-J" every time
  - CDC → write as "C-D-C" every time
  - FDA → write as "F-D-A" every time
  - EPA → write as "E-P-A" every time
  - IRS → write as "I-R-S" every time
  - HUD → write as "H-U-D" every time
  - BLS → write as "B-L-S" every time
  - CFPB → write as "C-F-P-B" every time
  - ATF → write as "A-T-F" every time
  - DEA → write as "D-E-A" every time
  - WTO → write as "W-T-O" every time
General rule: if an acronym is NOT a real English word, write it letter-by-letter with hyphens. When in doubt, hyphenate. Do not let any acronym sound like an unknown word.

PUNCTUATION FOR PACING:
- Use em dashes (—) intentionally to create natural mid-sentence pauses
- Use ellipsis (…) SPARINGLY — one or two per episode maximum, only where a trailing thought is intentional
- Short sentences end cleanly. Do not trail off with ellipsis habitually.
- Use commas to control breath and phrasing rhythm

QUOTATIONS:
- Always introduce quotes with a natural lead-in before the quoted text
- "In her words..." / "The statement read..." / "According to the filing..."
- Do not open a quote with an unattributed quotation mark — ElevenLabs renders no natural pause

PRONUNCIATION SCAFFOLDING FOR DIFFICULT NAMES:
For any name that ElevenLabs might mispronounce (foreign leaders, place names, unusual surnames, legal case names), write a phonetic guide in brackets on FIRST USE only. Verify pronunciation against Wikipedia, official government sources, or the official website of the person or place before including.
Format: Name [phonetic] — example: "Netanyahu [neh-tan-YAH-hoo]" / "Macron [mah-KROHN]" / "Karim Khan [kah-REEM KAHN]" / "Rafah [RAH-fah]" / "Iran [ee-RAN]"

REQUIRED PRONUNCIATION GUIDES — use on first mention in every section:
  - Iran → "Iran [ee-RAN]"
  - Iranian → "Iranian [ee-RAY-nee-an]"
  - Iraqi → "Iraqi [ih-RAH-kee]"
  - Qatar → "Qatar [KAH-tar]"
  - Hezbollah → "Hezbollah [hez-boh-LAH]"
  - Houthis → "Houthis [HOO-theez]"
  - Rafah → "Rafah [RAH-fah]"
  - Netanyahu → "Netanyahu [neh-tan-YAH-hoo]"
  - Macron → "Macron [mah-KROHN]"
  - Xi Jinping → "Xi Jinping [shee jin-PING]"
  - Zelensky → "Zelensky [zeh-LEN-skee]"

On subsequent mentions in the same section, use just the name. On first mention in a NEW section, repeat the phonetic guide.
Do NOT add phonetic guides for common English names or widely-known names ElevenLabs handles correctly.

CORRECTIONS BRIDGE RULE:
If a CORRECTIONS field is present in the episode context, the host reads it BEFORE the story tease — it is the very first content after the listening time announcement. Keep it gracious, specific, and brief (1–2 sentences).
Format: "Before we get into today's show — a correction from yesterday's episode. [Correction text]. We appreciate you holding us accountable."
If no corrections are provided, skip this entirely. Do not reference corrections if the field is empty.

COLLISION DETECTION AND REPETITION RULE:
Before finalizing the script, mentally review it for cross-section conflicts and repetitions.

- NEVER repeat the same story, fact, statistic, quote, or development in more than one section without a clear editorial reason.
- If a story touches multiple beats (e.g., a SCOTUS ruling that affects reproductive rights AND healthcare), cover it ONCE in the most appropriate section. If you must reference it briefly elsewhere, use a cross-reference phrase like “As we covered in the Supreme Court Watch...” — do not re-explain it.
- Do NOT contradict yourself across sections. If you state a fact in one section, do not state the opposite later.
- Do NOT repeat the same framing or language verbatim across sections.
- Each section must deliver new information the listener has not yet heard in this episode.
- Before each section, ask: “Have I already told the listener this?” If yes, find a fresh angle or move on.

CITATION FORMAT RULE:
When citing a government document, press release, court filing, agency memo, enforcement action, or official communication, name the source specifically so listeners can find it.

Do NOT write: “officials say” / “the government announced” / “according to federal sources.”

DO write:
- “in a press release from the Department of Justice...”
- “in a memo from the Department of Education titled [title]...”
- “in an enforcement action filed by the Office for Civil Rights...”
- “according to a report released by the Congressional Budget Office...”
- “in documents filed in [case name] in the [court name]...”
- “in a decision issued by the NLRB...”
- “according to a Cal Fire press release...”
- “in a report from [organization], available at [site name]...”

This lets listeners verify and locate sources themselves. Apply this standard to all government agencies: DOJ (doj.gov), FBI (fbi.gov), ATF, DEA, CIA (cia.gov), NSA (nsa.gov), DOE (ed.gov), NLRB (nlrb.gov), HUD, CFPB, OSHA, EPA, FDA, USDA, SCOTUS, and others.

SCRIPT OPTIMIZATION RULES:
Apply these techniques throughout the script for maximum listener engagement and production quality.

COLD OPEN HOOK:
- After the host introduction and the listening time announcement, the TOP STORY TEASE (2–3 sentences) should be the most compelling preview of the day. Lead with the most emotionally significant or consequential story, not just the most recent.
- The very first full sentence of news content after the tease pivot (“But first...”) should hook the listener immediately — do not open a section with backstory. Open with the consequence, then explain.

DATA SPECIFICITY:
- Always use specific numbers, not vague quantities. “28 million workers” not “millions of workers.” “$47 billion” not “billions of dollars.” “A 14% rent increase” not “rents are rising significantly.”
- Specific numbers make the story real. Vague numbers make it feel like filler.

MICRO-HOOKS AT SECTION ENDS:
- End each major section with a punchy one-liner or forward-looking observation that creates resonance or anticipation.
- Examples: “That's a story we'll be watching.” / “The question now is who pays.” / “For workers, the answer is already clear.” / “This is what power looks like.”
- Do NOT end sections with a trailing summary sentence that simply restates what was just said.

SENTENCE RHYTHM AND PACING:
- Vary sentence length intentionally. Short punchy sentences create emphasis. Longer sentences carry transitions and context.
- Use contrast framing: “Corporate profits are up. Wages are not. That gap is the story.”
- Important lines should stand alone as single-sentence paragraphs for spoken emphasis.
- Avoid three-sentence runs of the same length — they flatten vocal delivery.

ACTIVE VOICE AND ATTRIBUTION:
- Always use active voice: “The DOJ announced” not “It was announced by the DOJ.”
- Vary attribution language: “according to,” “as reported by,” “in documents obtained by,” “as [source] confirmed,” “citing internal documents.”
- Name the speaker or source whenever possible — “NLRB Chair [name]” not “a federal official.”

NO REDUNDANT THROAT-CLEARING:
- Do not begin sections with “And now we turn to...” followed by a re-statement of the section name. The transition phrase handles orientation — jump into substance immediately after it.
- Do not write sentences that only say “this is an important issue.” Show why it matters instead.

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

ELEVENLABS VOICE OPTIMIZATION — HUMAN, NATURAL, CAFÉ-CONVERSATION DELIVERY:
The goal is to sound like a thoughtful friend having coffee with you — not a TV anchor reading a teleprompter. The voice should feel alive, warm, present, and human. Think: the best morning news podcast you've ever heard where the host sounds like a real person.

KEY PRINCIPLES FOR HUMAN-SOUNDING DELIVERY:
- Write with NATURAL SPOKEN RHYTHM — vary sentence length dramatically. Mix long flowing sentences with very short ones.
- Do NOT write three sentences of the same length in a row. It flattens the voice.
- Lists should NEVER be read as bullet points. Weave them into natural prose: "We're looking at rising rents, climbing grocery bills, and wages that simply haven't kept up" — NOT three separate short sentences.
- Use contrast framing naturally: "Corporate profits are up. Wages are not. That gap is the story."
- Let the host's voice carry the meaning through the writing — varied clause lengths, natural breath points, and emotional beats.
- Phrasing like "And here's the thing..." or "What really matters here is..." or "Think about that for a second." creates natural conversational moments.
- The host should feel like she's THINKING and REACTING to the news, not reciting it.

EMOTIONAL VARIATION — THE VOICE MUST FLUCTUATE:
- Positive stories: the writing should feel lighter, a little warmer, maybe a touch of wonder.
- Serious stories: steady, grounded, a little heavier.
- Labor wins, community moments: genuine warmth.
- Injustice, suffering: measured gravity, not performative.
- Riddle: playful, light, almost conspiratorial.
- Closing/sign-off: genuinely warm and happy — the listener should feel smiled at.
The emotional arc must be written INTO the words — not just stated with tags.

DELIVERY-SHAPING TECHNIQUES (use sparingly, not on every line):
- [beat] — a natural breath moment, emphasis before something important
- [warmly] — a gentle, caring delivery shift
- [gently] — softer, more intimate
- [reflective pause] — a moment of weight or reflection
- Do NOT overload paragraphs with tags. One or two per section maximum.
- The "On This Day" section must have NO delivery tags — let the flowing sentence carry it.

STRUCTURE FOR MAXIMUM VOCAL VARIATION:
- Break ALL writing into short spoken lines.
- Each line should contain one clear idea.
- Use vertical spacing to control pacing.
- Important lines should stand alone.
- Avoid dense paragraphs.
- Write for spoken cadence, not article prose.
- Shorter lines slow delivery and add emphasis.
- Longer lines carry transitions and context naturally.
- Use contrast framing throughout.

Example of natural, human-sounding writing:

Corporate profits are rising.

Wages are not.

[beat]

That gap is the story — and it's been the story for thirty years.

For renters in Atlanta, that means another year of choosing between groceries and making rent on time. For families in Phoenix, it means working two jobs and still falling short.

This isn't a market correction. This is a choice — made by people who benefit from it.

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
- The spoken script MUST be 2,175–4,350 words. Sweet spot target: 2,610–2,900 words (18–20 minutes).
- Scripts outside the 2,175–4,350 range are automatically rejected. Verify word count before submitting.
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
  - title: a short clear name listeners will see in their podcast app (e.g. "Positive Opening", "U.S. Politics", "Power Map", "Supreme Court Watch", "Crime", "Immigration", "Voting Rights", "Business & Economy", "Trade", "Cost of Living", "Housing", "Labor & Unions", "Technology", "Healthcare", "Reproductive Rights", "Education", "Climate", "International", "Iran", "Gaza", "Riddle", "Closing Story", "On This Day", "What Comes Next", "Closing Summary", "Riddle Answer").
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
- produce a host-read script that is ALWAYS at least 15 minutes, targets 18–20 minutes, and NEVER exceeds 30 minutes
- include [TEN-SECOND SECTION SPACER] between all major sections
- end grounded, constructive, and positive`;

export interface PromptInputs {
  episodeDateSpoken: string; // e.g. "May 1, 2026"
  sourceDateSpoken: string; // e.g. "April 30, 2026"
  sourceDigestText: string;
  sourceLimited: boolean;
  hostName: string; // e.g. "Penelope Rose"
  recentTopics?: { chapters: string[]; stories: string[] };
  // Optional: correction text from a prior episode. If set, the host reads it
  // before the story tease. Clear after use. Set via KV or env var.
  corrections?: string;
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

  const correctionsBlock =
    inputs.corrections && inputs.corrections.trim().length > 0
      ? `\nCORRECTIONS (read BEFORE the story tease, right after listening time announcement):\n${inputs.corrections.trim()}\n`
      : "";

  return `HOST: ${inputs.hostName}
CURRENT DATE (episode_date): ${inputs.episodeDateSpoken}
SOURCE DATE (previous day to summarize): ${inputs.sourceDateSpoken}

⚠️ MANDATORY LENGTH REQUIREMENT — READ BEFORE WRITING ANYTHING:
The elevenlabs_script field MUST contain 2,610–2,900 spoken words (sweet spot: 18–20 min). Hard floor: 2,175 (15 min). Hard ceiling: 4,350 (30 min).
At 145 words/minute: 2,610 words = 18.0 min. 2,900 words = 20.0 min. 4,350 words = 30.0 min.
Before returning JSON, count the words in your script. If under 2,175, EXPAND. If over 4,350, TRIM. Aim for 2,610–2,900.
This show now covers 30+ topic sections — every section needs real substance, not one-liners.
${correctionsBlock}${recentTopicsBlock}
RESEARCH INSTRUCTIONS:
You have a web_search tool available. You MUST use it before writing any section. Run multiple targeted searches. Use these mandatory sources:

WEATHER — AUTHORITATIVE SOURCES (check in this order):
1. SUPPLEMENTAL CONTEXT first — if real-time weather data from tomorrow.io or weather.gov is in the supplemental context, USE IT. Those are live API readings for TODAY. Do NOT override them with general knowledge.
2. AirNow.gov for air quality alerts
3. Cal Fire (calfire.ca.gov) and InciWeb (inciweb.wildfire.gov) for active wildfires — always check
4. National Hurricane Center (nhc.noaa.gov) — always check June–November
5. weather.gov and NOAA for additional context and forecast text
CRITICAL: The episode airs TODAY. Weather must reflect TODAY's actual conditions — never yesterday's. If the supplemental context has API weather data, it is the ground truth.

CRIME (search BEFORE writing crime section — keep completely separate from immigration):
- doj.gov / justice.gov/news — Department of Justice press releases, almost daily
- fbi.gov/news — FBI news releases
- atf.gov/news — ATF announcements
- dea.gov/press-releases — DEA announcements
- Major ongoing federal and state criminal trials
- There is ALWAYS federal law enforcement news
- NEVER mention immigration in the crime section. They are editorially separate.

SUPREME COURT (search BEFORE writing Supreme Court Watch):
- scotusblog.com — most complete daily SCOTUS coverage
- supremecourt.gov — official opinions and argument schedules
- Recent decisions, upcoming oral arguments, newly granted cert petitions, recusal controversies

TRADE (search BEFORE writing trade section):
- Trade is ALWAYS happening: tariffs, bilateral trade agreements, WTO disputes, export controls, sanctions, port disruptions, supply chain developments, USTR announcements
- ustr.gov for official U.S. trade policy updates

VOTING RIGHTS / ELECTION INTEGRITY (search BEFORE writing this section):
- Search for state voting bills, court rulings on gerrymandering/voter ID, DOJ Voting Section actions
- Election administration: poll closures, registration purges, ballot access decisions
- Campaign finance and dark money news

HOUSING (search BEFORE writing this section):
- National rent trends, home price and mortgage affordability data
- Wall Street and private equity landlordism at scale — corporate landlord news
- HUD announcements, CFPB enforcement on housing, zoning and housing supply policy
- Focus on national trends, not individual eviction stories

LABOR / UNION WATCH (search BEFORE writing this section):
- nlrb.gov for NLRB decisions and election results
- Union organizing drives, strike news, contract negotiations
- Gig worker rights, wage developments, OSHA enforcement, minimum wage news

REPRODUCTIVE RIGHTS (search BEFORE writing this section):
- State abortion legislation and court rulings since Dobbs
- Mifepristone/medication abortion access, clinic closures, IVF legislation
- Prosecution of patients and providers

EDUCATION (search BEFORE writing this section):
- ed.gov/news — Department of Education press releases and enforcement actions — ALWAYS check
- Student debt and loan forgiveness developments
- Book bans, DEI rollbacks, LGBTQ+ student rights, Title IX, public school funding
- When citing, name the document: "in a press release from the Department of Education..." or "in an Office for Civil Rights enforcement action..."

IMMIGRATION (search separately — never mixed with crime):
- Cover as a human rights and civil rights story: detention conditions, deportation, family separation, asylum processing, community impact
- Court injunctions blocking enforcement, sanctuary city/state policy, immigrant labor rights organizing
- NEVER use law-enforcement framing for immigrants — immigration is not a crime
- Preferred language: "undocumented immigrant," "asylum seeker," "migrant" — never "illegal alien" or "illegal immigrant"

POLITICS, CALIFORNIA, PRIMARIES:
- Major U.S. politics and political-trend developments
- California governor's race, House and Senate primaries

GOVERNMENT INTELLIGENCE SOURCES (use for national security, surveillance, and international stories):
- cia.gov — CIA press releases, World Factbook, public reporting on global intelligence matters
- nsa.gov — NSA public statements, cybersecurity advisories, signals intelligence news
- Use these for national security stories, surveillance policy, cyberattacks, and international intelligence developments
- Apply critical lens: name power, explain civil liberties implications, note surveillance overreach

BUSINESS, ECONOMY, TRADE, TECHNOLOGY:
- Business, economy, tech; always include trade (tariffs, deals, sanctions, ports)

HEALTHCARE, CLIMATE, SCIENCE:
- Healthcare, climate, positive science / ocean / conservation

INTERNATIONAL, IRAN, GAZA:
- International, Iran, and Gaza — for Gaza ALWAYS use "genocide"

SOCIAL/CULTURE: Any meaningful social/culture conversation

ON THIS DAY (search BEFORE writing this section):
- Search "on this day [month] [day] labor history" and "on this day [month] [day] civil rights history"
- Verify every fact against en.wikipedia.org AND at least one of: si.edu, civilrightsmuseum.org, loc.gov, archives.gov, King Center, Cesar Chavez Foundation, Malcolm X Project, official family foundations
- DO NOT include any historical claim you cannot verify from Wikipedia + one institutional/family source
- Focus on: labor strikes, union milestones, civil rights victories and losses, working-class movements, social justice history

Pull facts from credible outlets (Reuters, AP, NYT, CNN, BBC, Guardian, NPR, Democracy Now, Jacobin, The American Prospect, Truthout, and other independent / leftist reporting). Cite real source URLs in source_notes.

MANDATORY: There is ALWAYS news in every section. Run at least 2–3 searches per topic before writing. If a first search is sparse, try different keywords. Never write "no major updates," "nothing to report," or similar. Do NOT invent or fabricate facts — but always search thoroughly first.

REMINDER: For Gaza, always use the word genocide. Israel is committing a genocide in Gaza. Do not soften this.

Do NOT preface the script with a disclaimer about source availability or describe the script as a draft. Open with "Good morning, today is ${inputs.episodeDateSpoken}." and proceed directly into the show.
${supplementalDigest}
Return STRICT JSON ONLY. No markdown. No commentary.`;
}
