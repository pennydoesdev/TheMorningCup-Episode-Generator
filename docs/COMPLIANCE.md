# Compliance and Legal Guide

This document covers legal, regulatory, and platform compliance requirements
for all AI-assisted podcast productions at Fold 42.

**This is not a substitute for legal counsel.** For material questions, consult
Fold 42's legal team before proceeding.

---

## 1. Voice Talent Agreement

### Why it's required

Every show using a cloned voice must have a signed Voice Talent Agreement on file
before any ElevenLabs work begins. Without it:
- The production has no license to use the voice
- The voice actor has no documented consent
- Revenue sharing obligations are undefined
- Fold 42 is exposed to significant legal liability

### What the agreement must cover

A Fold 42 Voice Talent Agreement for AI productions must include at minimum:

**Grant of rights**
- Express written consent to create an AI voice clone using ElevenLabs (or named platform)
- The scope of use: show name, publisher (Fold 42), platforms, territories, duration
- Whether the license is exclusive or non-exclusive
- What happens to the clone if the agreement ends

**Compensation and revenue sharing**
- The revenue sharing percentage or flat fee structure
- Payment schedule and method
- How revenue is defined and calculated
- What counts as a qualifying episode

**Quality and editorial control**
- The talent's right to review and object to content
- What objections can trigger episode removal
- Whether the talent has approval rights over the master prompt
- Process for raising concerns about how their voice is being used

**Term and termination**
- Duration of the agreement
- Notice period for termination
- What happens to existing episodes after termination
- Whether the voice clone is destroyed upon termination

**Representations and warranties**
- That the talent owns the rights to their voice
- That the talent is not under a conflicting agreement
- Fold 42's obligations regarding data security and the voice model

### Who approves the agreement

Agreements must be reviewed by Fold 42 Legal before signing.
Do not begin voice cloning work without a signed copy on file.

### Storage

Signed agreements are stored in Fold 42's secure document management system.
The compliance reviewer and Legal must both have access.

---

## 2. Platform AI Disclosure Requirements

### Spotify

**Required:** Add "AI-generated voice" to your show description in Spotify for Podcasters.

Spotify's AI content policy requires disclosure when a synthetic or AI-generated
voice narrates podcast content. Failure to disclose can result in content removal
or account suspension.

**Where:** Your show's description page in Spotify for Podcasters dashboard.
**What to add:** Use the "SPOTIFY" block from your Metadata.txt.

### Apple Podcasts

**Required:** Disclosure in show description.

Apple's guidelines prohibit misleading listeners. While Apple has not yet implemented
a mandatory AI label system (as of this writing), the show description disclosure
satisfies their requirements.

**Where:** Show description in Apple Podcasts Connect.
**What to add:** Use the "APPLE PODCASTS / iHEART / AMAZON MUSIC" block from Metadata.txt.

### YouTube

**Required:** Check the "Altered or synthetic content" checkbox AND include
disclosure text in the video description.

YouTube requires creators to disclose realistic AI-generated voices under their
Creator Responsibility guidelines. Non-disclosure can result in demonetization
or content removal.

**Where:** In YouTube Studio → Details → scroll to "Altered or synthetic content"
for every upload.
**What to add:** Use the "YOUTUBE AUDIOGRAM" block from Metadata.txt in the description.

### iHeart / Amazon Music

**Currently no mandatory label** (policy may change). The standard disclosure
boilerplate in your show description satisfies current requirements.

### RSS / other platforms

Include the standard disclosure in your show description and episode descriptions
across all platforms. This is generated automatically in every Metadata.txt.

---

## 3. Copyright

### Show content

- **Original script content:** Copyright belongs to Fold 42 from the moment of creation.
  AI-generated content where a human directs the creation is protectable in most
  jurisdictions, though the legal landscape is evolving. Consult Legal for current guidance.
- **Source material:** Factual information is not copyrightable. Quoting from sources
  requires fair use analysis. The pipeline cites sources by name and document — do not
  reproduce verbatim text from third-party sources in the script.
- **Music:** All sound assets (Hello.mp3, Goodbye.mp3, Topic Transition.mp3) must be
  either owned by Fold 42, licensed for commercial use and podcast distribution, or
  created for this purpose. Streaming licenses (Spotify for Artists, etc.) do not cover
  podcast use. Verify the license terms for every sound asset before use.

### Voice clone

The ElevenLabs-generated audio is a derivative work of the voice actor's training data.
The voice talent agreement defines who owns this work. Ensure the agreement explicitly
addresses ownership of generated audio.

### Episode metadata and descriptions

Copyright in original expression (descriptions, social copy) belongs to Fold 42.

---

## 4. Data Privacy

### What data we collect and store

Every episode generates and stores:
- The full episode script (text)
- All audio chunks (MP3)
- Episode metadata (titles, descriptions, chapter markers)
- Source notes with URLs
- Run logs (timestamps, word counts, validation results)

All of this is stored in the Fold 42 R2 bucket (`vicinity`) under
`Generators/Podcasts/[ShowSlug]/`.

### What data we do NOT store

- Listener data or analytics (not collected by this pipeline)
- Personal information of listeners
- The voice actor's raw training audio (stored in ElevenLabs, not in our R2)

### Retention

Episode files in R2 are retained indefinitely unless explicitly deleted.
Establish a retention policy and document it here if your show requires one.

### Third-party data processing

| Processor | What data | Purpose |
|-----------|-----------|---------|
| OpenAI | Episode prompt, research context | Script generation |
| ElevenLabs | Script text, voice clone | TTS audio generation |
| Cloudflare | Episode files | Storage and Worker execution |
| Resend | Completion notification | Email delivery |

Review each processor's data processing agreements. OpenAI and ElevenLabs data
processing addenda (DPAs) should be on file with Fold 42 Legal.

---

## 5. FCC and Broadcast Standards

This infrastructure produces content for podcast distribution, not over-the-air
broadcasting. FCC regulations governing traditional broadcast do not apply.

However, Fold 42's editorial standards for accuracy, defamation, and political
content apply to all shows regardless of distribution channel.

---

## 6. Political and Advocacy Content

### Paid political content

If any episode discusses candidates, ballot measures, or political parties in a
way that constitutes advocacy, consult Legal before publication. Podcast advertising
laws vary by jurisdiction. This pipeline does not produce advertising — but
editorial advocacy may trigger disclosure requirements on some platforms.

### Balance requirements

Fold 42 does not maintain FCC-style fairness doctrine obligations (we are not
a broadcast licensee), but our editorial standards require factual accuracy
and appropriate sourcing for all political coverage. See BEST-PRACTICES.md
for coverage rules.

---

## 7. Defamation and Accuracy

### Risk areas

AI-generated content carries inherent hallucination risk. The pipeline mitigates
this by:
- Requiring named sources in every section
- Requiring the model to cite documents by name
- Storing source notes with URLs in every episode JSON
- Quarterly source URL audits (see AUDIT.md)

### Producer responsibility

Despite these mitigations, producers are responsible for the final content.
A producer who becomes aware of a factual error must escalate immediately —
not wait for the next automated episode. See AUDIT.md Part 4 for incident response.

### Never acceptable

- Falsely attributed quotes or statements
- Claims that a specific named individual committed a crime without a conviction
  or formal charge by an official body
- Health or safety claims that contradict official guidance without expert sourcing
- Content that sexualizes, demeans, or threatens any identified individual

---

## 8. Compliance Contacts

| Issue | Contact |
|-------|---------|
| Voice talent agreement | Fold 42 Legal |
| Platform policy question | Executive Producer + Legal |
| Factual error / retraction | EP within 1 hour, Legal if material |
| Copyright claim received | Legal immediately |
| Data privacy question | Legal |

---

## 9. Compliance Calendar

| Task | Frequency | Owner |
|------|-----------|-------|
| Voice talent agreement renewal review | Annual | EP + Legal |
| Platform disclosure verification | Quarterly | Compliance reviewer |
| Source URL audit (random sample) | Quarterly | Compliance reviewer |
| Revenue sharing payment verification | Per payment schedule | Finance + EP |
| Data processor DPA review | Annual | Legal |
| ElevenLabs account review (active clones) | Quarterly | Developer |
| Full compliance audit report | Annual | Compliance + Legal |
