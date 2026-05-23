# Episode Audit Guide — Producers and Compliance

This guide covers how to review, verify, and document Fold 42 podcast episodes.
It applies to all shows built on this infrastructure.

---

## Who should audit and when

| Role | Frequency | What they check |
|------|-----------|-----------------|
| **Producer** | Every episode (spot-check) | Audio quality, section flow, factual tone |
| **Executive Producer** | Weekly | Full episode review, editorial consistency |
| **Compliance** | Quarterly | AI disclosure, source attribution, coverage rules |
| **Legal** | On request / annually | Voice talent agreements, copyright, platform compliance |

---

## Part 1 — Daily Producer Spot-Check (5 minutes per episode)

After each episode generates, a producer should review the Metadata.txt and
optionally listen to a section or two. This is not a full review — it's a
sanity check.

### What to check in Metadata.txt

Open `The Morning Cup - YYYY-MM-DD - Metadata.txt` from the Chunks folder.

**Word count and runtime** — do they match the show's targets?
```
Runtime: ~XX.X min  (XXXX words)
```
If the runtime is significantly outside the target range (±15%), flag it.

**Title options** — do they make sense for today's stories?
The three title options should clearly reflect the actual content.
If they're generic or misleading, the episode copy generation may have failed
and fallen back to the social summary.

**SEO description** — is it 150–160 characters and accurate?

**AI disclosure block** — is it present at the bottom of the file?
Look for the `AI & VOICE DISCLOSURE — copy per platform` section.
If it's missing, something went wrong with the metadata generation.

**Source notes** — are there real sources listed with URLs?
The source notes section should have 5–15 entries with actual URLs.
If it's empty or has placeholder text, the episode may have hallucinated
its sources.

### Red flags that require a full review

- Runtime more than 3 minutes outside target
- Source notes section empty or has fewer than 5 entries
- Any title option mentions a topic that wasn't actually in the news
- Metadata.txt missing the AI disclosure section
- Completion email not received by expected publish time

---

## Part 2 — Full Episode Review (30 minutes)

Producers or EPs should complete a full review for every new show's first 10 episodes,
then weekly thereafter. Use this checklist.

### Script review (open the .txt file from the Chunks folder)

**Structure**
- [ ] Episode opens with "Good morning, today is [date]" or show's configured opening
- [ ] Opening includes listening time announcement
- [ ] Opening includes 2–3 story tease
- [ ] All expected sections are present in the correct order
- [ ] Each section has a transition bridge after the sting
- [ ] Riddle appears before the outro
- [ ] Outro includes the Fold 42 CTA
- [ ] Riddle answer is the last thing in the script
- [ ] Show name mentioned at least once
- [ ] Host name mentioned in opening and outro

**Content quality**
- [ ] Each section covers what it's supposed to cover
- [ ] No story is repeated across sections
- [ ] All statistics have a named source
- [ ] No citation URLs read aloud
- [ ] No "there are no updates" language
- [ ] No production notes or music cues in the script
- [ ] Numbers are written as spoken ("forty-two percent" not "42%")
- [ ] Dates use ordinal form ("the thirtieth" not "the thirty")

**Editorial standards**
- [ ] Immigration not framed as crime (show-specific rule)
- [ ] No "illegal alien" language
- [ ] Climate coverage is consistent with editorial policy
- [ ] Gaza / conflict coverage uses show-defined terminology
- [ ] Pronouns for named individuals are consistent and appropriate
- [ ] No unsourced speculation presented as fact

### Audio review (listen to the assembled episode)

**Technical**
- [ ] Hello.mp3 plays first, at correct volume
- [ ] Coffee pour / ambient sound plays correctly (if applicable)
- [ ] Intro sting plays before first section
- [ ] Section stings play between every section — not skipped, not doubled
- [ ] Goodbye.mp3 plays last
- [ ] No obvious audio artifacts, dropouts, or glitches
- [ ] Volume is consistent across sections (loudness normalization working)

**Voice quality**
- [ ] Host voice sounds natural and consistent with baseline
- [ ] No words mispronounced (especially proper nouns)
- [ ] Delivery tone matches section type (warm for stories, authoritative for hard news)
- [ ] No robotic delivery or unusual pauses

**Chapter markers** (check in Overcast, Apple Podcasts, or Podcast Addict)
- [ ] Chapter list appears when playing the episode
- [ ] Chapter titles match the script sections
- [ ] Chapter timestamps roughly match where sections start

---

## Part 3 — Quarterly Compliance Audit

This audit is performed by the Fold 42 compliance reviewer or an assigned EP.
It covers the last 13 weeks of episodes for one show.

### Sample selection

Review a stratified random sample:
- 1 episode per week for the quarter (13 episodes minimum)
- Plus all episodes where the producer flagged a concern

### AI disclosure compliance

For each sampled episode:

- [ ] Metadata.txt contains the AI & VOICE DISCLOSURE section
- [ ] Episode description published on the podcast platform ends with the disclosure
- [ ] Spotify show description contains "AI-generated voice" label
- [ ] Apple/iHeart show description contains disclosure language
- [ ] YouTube uploads (if any) have the "Altered or synthetic content" checkbox checked

Document any gaps and the date they were discovered. Update the platform listings
if the disclosure language is missing or outdated.

### Source attribution audit

For 3 randomly selected episodes from the quarter:

1. Open the Metadata.txt source notes section
2. For each source note, visit the listed URL
3. Verify the URL is real, the source exists, and the cited content matches
   what the episode described

**Acceptable variance:** Minor paraphrasing is expected. Flag:
- URLs that 404 (the source never existed — possible hallucination)
- Dates that are significantly off
- Claims attributed to a source that contradict what the source actually says

Document findings. Three or more unverifiable sources in the same episode is
a material issue requiring EP escalation.

### Coverage rules compliance

For each sampled episode, verify that:
- [ ] Immigration is covered separately from crime
- [ ] Immigration terminology follows show guidelines
- [ ] Climate coverage matches editorial policy
- [ ] All sections mandated by the prompt are present in every episode
- [ ] No section systematically missing across multiple episodes

A section missing from more than 20% of sampled episodes indicates a
prompt compliance issue. Escalate to the developer for prompt review.

### Voice talent compliance

Verify once per quarter:
- [ ] Voice talent agreement is on file and has not expired
- [ ] Revenue sharing payments are up to date (coordinate with Finance)
- [ ] ElevenLabs voice clone is still active and associated with the correct account
- [ ] No unauthorized use of the voice model outside this pipeline

---

## Part 4 — Incident Response

### Episode contains factual error

**Severity: High**

1. Note the episode date and the specific error
2. Add a correction to the KV store:
   ```bash
   wrangler kv key put --binding MORNING_CUP_KV pending_corrections \
     "Correction: In yesterday's episode we reported [X]. The accurate information is [Y]."
   ```
3. The next episode will read this correction on-air before the story tease
4. Update the episode description on all platforms with a written correction note
5. Document the error, its cause, and the correction in the show's incident log

### Episode fails to generate

**Severity: Medium**

1. Check worker status:
   ```bash
   curl -H "Authorization: Bearer $RUN_SECRET" \
     "https://your-worker.workers.dev/status?date=YYYY-MM-DD"
   ```
2. Check the rejected JSON at `your-prefix/rejected/` in R2 via the Cloudflare dashboard
3. Review the validation errors in the status response
4. If fixable (repair pass failed, word count low), force a re-run:
   ```bash
   curl -X POST "https://your-worker.workers.dev/run?date=YYYY-MM-DD&force=true" \
     -H "Authorization: Bearer $RUN_SECRET"
   ```
5. If not fixable automatically, escalate to the developer

### Voice quality degradation

**Severity: Medium**

1. Document the episode date and describe the degradation
2. Compare to a baseline episode from 30+ days ago
3. If consistent across 3+ episodes, escalate to the developer
4. Options: adjust voice settings in wrangler.toml, or resubmit the voice clone
   with additional training audio in ElevenLabs

### Unauthorized content in episode

**Severity: Critical**

1. Pull the episode from all platforms immediately
2. Preserve the raw JSON from R2 as evidence
3. Escalate to EP and Legal within 1 hour
4. Do not re-run until root cause is identified and prompt is reviewed

---

## Audit Log Template

Keep a running log for each show. One entry per review.

```
Date reviewed: YYYY-MM-DD
Episodes reviewed: YYYY-MM-DD to YYYY-MM-DD
Reviewed by: [Name]
Review type: [spot-check / full / quarterly compliance]

Issues found:
- [description, severity, episode date]

Actions taken:
- [what was done, by whom, date]

Sign-off: [Name, Date]
```
