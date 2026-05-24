# Compliance Guide

Covers AI content disclosure obligations, voice talent licensing, copyright, daily producer checks, periodic audits, incident response, and data privacy for The Morning Cup and all shows built on this infrastructure.

---

## Table of Contents

- [AI Content Disclosure](#ai-content-disclosure)
- [Voice Talent Agreement](#voice-talent-agreement)
- [Copyright](#copyright)
- [Producer Compliance Checklist](#producer-compliance-checklist)
- [Full Episode Audit](#full-episode-audit)
- [Incident Response](#incident-response)
- [Data Privacy](#data-privacy)

---

## AI Content Disclosure

### Platform Requirements

**Apple Podcasts**
Apple requires that shows using AI-generated content declare this in the podcast feed using the `ai_generated` field. The show's RSS feed must include this declaration at the show level. Check the Apple Podcasts Connect dashboard to verify the declaration is present and up to date.

**Spotify**
Spotify requires AI disclosure in show metadata. Update the show description in Spotify for Podcasters to include explicit language stating that the show uses AI-generated voice and content.

**Other platforms (iHeart, Amazon Music, Overcast, Pocket Casts)**
Each platform has its own disclosure policies, which are updated periodically. Review platform-specific guidelines quarterly and update show descriptions as required.

### How This Show Handles Disclosure

- Every episode's `Metadata.txt` includes an `AI & VOICE DISCLOSURE` section, which is used to populate platform-specific copy
- Every episode description published to podcast platforms ends with the required disclosure language
- The host character, Penelope Rose, is a disclosed AI voice — not a real person's cloned voice

If a generated episode's `Metadata.txt` is missing the AI disclosure section, the metadata generation step failed or fell back to a truncated output. This is a red flag requiring manual review of that episode.

[↑ Back to top](#table-of-contents)

---

## Voice Talent Agreement

### ElevenLabs Terms

The voice used in this show is licensed under the ElevenLabs Terms of Service. Key points:

- The voice is a created persona (Penelope Rose), not a clone of a real, identifiable person's voice without their consent
- Commercial use rights must be confirmed under the active ElevenLabs subscription plan — verify this when renewing or upgrading plans
- The voice model is associated with a specific ElevenLabs account; do not share account credentials or voice IDs with third parties

### Quarterly Voice Talent Verification

Once per quarter, confirm:

- [ ] The ElevenLabs subscription is active and covers commercial use
- [ ] The voice clone is still active and associated with the correct account
- [ ] There is no unauthorized use of the voice model outside this pipeline (check ElevenLabs usage logs)
- [ ] If revenue sharing or any licensing arrangement is in place, payments are current (coordinate with Finance)

[↑ Back to top](#table-of-contents)

---

## Copyright

### Show Content

News summaries and analysis produced by this pipeline constitute editorial commentary and synthesis. They are transformative works and fall within fair use principles applicable to commentary and news analysis. All cited sources retain their own copyright.

Key points:

- **Show copyright:** © Fold 42 (current year). The copyright string is built automatically as `Copyright {YEAR} - Fold 42` and written into ID3 tags by `build-episode.sh`.
- **Source material:** All sources cited in the script must be real, verifiable sources. Cited content is summarized and analyzed, not reproduced verbatim.
- **AI-generated content:** Under current U.S. copyright guidance, AI-generated content may have limited or no copyright protection on its own. Fold 42's editorial direction, curation, and selection of sources is the basis for the company's copyright claim over the finished episodes.

### Music and Sound Effects

All music cues, intro/outro music, and section stings used in production must be licensed for commercial podcast use. This includes:

- Synchronization licensing if music is a recognizable composition
- Master recording licensing for recorded performances
- Mechanical licensing if applicable to your distribution model

Verify that license coverage explicitly includes commercial podcast distribution before using any audio asset in production. Keep license documentation on file.

[↑ Back to top](#table-of-contents)

---

## Producer Compliance Checklist

A quick daily spot-check for every episode before it is approved for publish. This is not a full review — it is a sanity check that should take under five minutes.

Open the episode's `Metadata.txt` and the `.txt` script from the Chunks folder.

- [ ] Script does not include fabricated direct quotes attributed to real, named people
- [ ] All factual claims in the script have corresponding source notes in the episode JSON (check `source_notes` field)
- [ ] No music cues or production notes are present in the spoken script (e.g., `[music cue]`, `[production note]`, `[pause for effect]`)
- [ ] Weather data appears to be from a live feed — it includes specific, current figures rather than generic seasonal language
- [ ] Fact-check result in the sidecar JSON shows at least 2 out of 3 checks passing green
- [ ] No initialisms are read as letters — agency and organization names are spelled out in full on first reference
- [ ] Chemical, medical, and scientific terms are presented with correct context (not sensationalized) and include pronunciation guidance where needed

### Red Flags Requiring Full Review Before Publish

- Runtime more than 3 minutes outside the target range
- Source notes section has fewer than 5 entries or contains placeholder text
- Any title option references a topic that was not covered in the actual news
- AI disclosure section missing from `Metadata.txt`
- Completion notification not received by the expected publish time

[↑ Back to top](#table-of-contents)

---

## Full Episode Audit

### Who Audits and How Often

| Role | Frequency | Scope |
|---|---|---|
| Producer | Every episode | Daily spot-check (see above) |
| Executive Producer | Weekly | Full episode review — script + audio |
| Compliance reviewer | Quarterly | AI disclosure, source attribution, coverage rules |
| Legal | On request / annually | Voice talent agreements, copyright, platform compliance |

### Monthly Spot Audit

Download the sidecar JSON for 5 randomly selected episodes from the past month.

For each:

1. **Review fact-check pass/fail rates** — note which checks failed and whether the failure was addressed before publish
2. **Verify source note URLs are valid** — visit each listed URL and confirm the source exists and the cited content matches what the episode described. Flag any 404s (possible hallucination) or significant factual mismatches
3. **Check pronunciation flags** — review the episode's audio for any mispronounced proper nouns or place names that should be added to `data/pronunciation-dictionary.json`
4. **Confirm AI disclosure** — verify the published episode description on all active platforms ends with the current disclosure language

### Quarterly Compliance Audit

Review a stratified random sample of 13 episodes (1 per week of the quarter), plus all episodes where a producer flagged a concern.

**AI disclosure compliance:**
- [ ] Every sampled episode's `Metadata.txt` contains the AI disclosure section
- [ ] Episode descriptions published on all platforms end with current disclosure language
- [ ] Spotify show description contains "AI-generated voice" label
- [ ] Apple Podcasts Connect shows `ai_generated` declaration is current
- [ ] YouTube uploads (if any) have the "Altered or synthetic content" checkbox checked

**Source attribution audit (3 randomly selected episodes from the quarter):**
- For each source note, visit the listed URL and verify it is real, the source exists, and the cited content matches what the episode described
- Three or more unverifiable sources in the same episode is a material issue requiring EP escalation

**Coverage rules compliance:**
- [ ] Immigration covered separately from crime in every sampled episode
- [ ] Immigration terminology follows show guidelines ("undocumented immigrant," "asylum seeker," "migrant" — never "illegal alien")
- [ ] Climate coverage consistent with editorial policy
- [ ] All required sections present in every sampled episode — any section missing from more than 20% of sampled episodes indicates a prompt compliance issue requiring developer review

[↑ Back to top](#table-of-contents)

---

## Incident Response

### Factual Error Published

**Severity: High**

1. Note the episode date and the specific error — be precise about what was stated and what the accurate information is
2. Inject an on-air correction for the next episode via KV:
   ```bash
   npx wrangler kv key put --remote \
     --binding MORNING_CUP_KV \
     pending_corrections \
     "Correction: In yesterday's episode we reported [X]. The accurate information is [Y]."
   ```
   The next episode will read this correction before the story tease, then KV auto-clears it
3. Update the published episode description on all podcast platforms with a written correction note
4. Document in `CHANGELOG.md`: the error, which pipeline stage it originated in (source digest, OpenAI generation, or fact-check miss), the correction, and the date resolved

### Episode Fails to Generate

**Severity: Medium**

1. Check worker status:
   ```bash
   curl -H "Authorization: Bearer $RUN_SECRET" \
     "https://themorningcupgenerator.itsmiarosemathews.workers.dev/status?date=YYYY-MM-DD"
   ```
2. Check the rejected output at `{R2_KEY_PREFIX}/rejected/` in R2 via the Cloudflare dashboard — the raw JSON shows exactly what the model produced and why validation failed
3. Review the `validation_errors` field in the status response
4. If the failure is recoverable (word count low, repair pass failed), force a re-run:
   ```bash
   curl -X POST \
     "https://themorningcupgenerator.itsmiarosemathews.workers.dev/run?date=YYYY-MM-DD&force=true" \
     -H "Authorization: Bearer $RUN_SECRET"
   ```
5. If failures are persistent across multiple days, escalate to the developer for prompt review

### Voice Quality Degradation

**Severity: Medium**

1. Document the episode date and describe the degradation specifically — is it mispronunciation, robotic delivery, unusual pauses, or drift from the baseline voice character?
2. Compare to a baseline episode from 30+ days ago
3. If degradation is consistent across 3 or more episodes, escalate to the developer
4. Options: adjust `VOICE_STABILITY`, `VOICE_STYLE`, or `VOICE_SIMILARITY_BOOST` in `wrangler.toml`, or resubmit the voice clone with additional training audio in ElevenLabs

### Unauthorized or Harmful Content in Episode

**Severity: Critical**

1. Pull the episode from all platforms immediately
2. Preserve the raw JSON from R2 as evidence — do not delete it
3. Escalate to EP and Legal within 1 hour
4. Do not re-run or generate new episodes until root cause is identified and the prompt has been reviewed and corrected

[↑ Back to top](#table-of-contents)

---

## Data Privacy

**Listener data:** This system collects no listener data. There are no analytics calls, tracking pixels, or listener identification mechanisms in the generator pipeline.

**OpenAI API:** Script generation calls send episode content — including the topic list, source digest, and any KV-stored corrections — to OpenAI's API. Review [OpenAI's data usage policy](https://openai.com/policies/api-data-usage-policies) to understand how API inputs are handled. By default, OpenAI does not use API inputs to train models, but confirm this applies to your account tier.

**ElevenLabs API:** TTS calls send the full script text to ElevenLabs. Review [ElevenLabs' privacy policy](https://elevenlabs.io/privacy) to understand how submitted text is stored and processed. Confirm that your subscription tier covers commercial use and review data retention terms.

**Cloudflare Workers KV:** Run records, approval records, and pending corrections are stored in KV. KV data persists until explicitly deleted. The run record for each episode includes the script content, approver details, and validation results. Treat KV data with appropriate access controls — limit who has access to the Cloudflare account and the `RUN_SECRET`.

[↑ Back to top](#table-of-contents)
