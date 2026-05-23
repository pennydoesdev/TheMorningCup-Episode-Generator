# ElevenLabs Prompt Library

Copy-paste prompts that have worked. All assume **ElevenLabs Sound Effects** unless noted.

Generate **5+ takes** of each — the model is genuinely random and the 4th take is often noticeably better than the 1st.

---

## Section sting (`morning-cup-sting.wav`)

The transition between news sections — should feel light, morning-positive, modern.

**Cheery synth-pop:**
```
Cheery synth-pop morning transition sting, 2 seconds, bright pluck synth and clean drum hit, ascending three-note motif, warm analog pad underneath, upbeat go-getter energy, polished broadcast quality, clean tail no fade-out
```

**Retro 80s synth-pop:**
```
Upbeat morning podcast transition, 2 seconds, retro 80s synth-pop, bright sparkly arpeggio rising, light electronic kick on the downbeat, cheerful and motivational, clean professional mix, no vocals
```

**Modern indie-pop:**
```
Cheerful synth-pop bumper, 2 seconds, mallet synth and tambourine, four-note ascending hook, sunny morning vibe, modern indie-pop production, ends crisp not faded
```

**Bright go-getter:**
```
Bright morning energy sting, 2 seconds, snappy synth-pop, plucky lead synth playing rising motif, soft handclaps, optimistic and motivational, broadcast-ready, clean ending
```

Settings: duration **2 sec**, prompt influence **70-80%**.

---

## News-intro sting (`intro-sting.wav`)

Plays once, right after "Cream or sugar, hon?" and before chunk-001. Signals "now the news begins" — should feel different from the section sting (more weight, more deliberate).

**Cinematic news-bulletin:**
```
Modern morning news intro sting, 2 seconds, ascending three-note brass-and-synth motif resolving on a confident major chord, broadcast bumper feel, polished radio-news quality, no fade-out, clean ending
```

**Crisp podcast news:**
```
Crisp podcast news bumper, 2 seconds, soft electronic kick on the downbeat, bright synth stab on beat two, short tonal sweep, signals "now the news begins", professional clean broadcast quality
```

**Warm public-radio:**
```
Warm public-radio news intro sting, 2 seconds, soft mallet synth playing a confident four-note rising line, gentle pulse beneath, modern morning-show feel, polished mix, ends crisp
```

**Energetic morning-news:**
```
Upbeat morning news bumper, 2.5 seconds, bright synth pluck plus light rhythmic shaker, ascending motif with confident resolve, signals start of the broadcast, professional clean mix, no fade-out
```

Settings: duration **2 sec** (or 2.5 for the energetic), prompt influence **75-80%**.

---

## Coffee Pour (`Coffee Pour.wav`)

Just the pour ambience, no voice. Voice line is generated separately with TTS.

**Cozy diner:**
```
Coffee pouring into a thick ceramic diner mug, warm liquid gurgle, 2 seconds, clean broadcast quality, ends naturally
```

**Generic warm pour:**
```
Sound of fresh hot coffee being poured into a porcelain cup, warm trickling sound, 2 seconds, clean mix, no music
```

Settings: duration **2 sec**, prompt influence **60-70%** (lower so model has flexibility for natural foley).

⚠️ **The Sound Effects model is unreliable for clear speech.** Don't try to bake a voice line into the pour generation — generate the line separately via Text-to-Speech with your cloned voice (next section).

---

## Voice line ("Cream or sugar, hon?.mp3")

Use ElevenLabs **Speech (Text-to-Speech)** — NOT Sound Effects. URL: https://elevenlabs.io/app/speech-synthesis

1. Pick your cloned voice from the Voice dropdown (the same voice ID the worker uses).
2. Type just: `Cream or sugar, hon?`
3. Voice settings:
   - **Stability:** 0.30 (lower = more conversational, less robotic)
   - **Similarity Boost:** 0.85 (default is fine)
   - **Style Exaggeration:** 0.40-0.60 (some warmth)
4. Generate, listen, regenerate until you get a friendly take.
5. Download as `Cream or sugar, hon?.mp3` and drop into `Sounds/`.

You can swap the line for variety without changing any code:
- `Cream or sugar, hon?`
- `How d'you take it?`
- `Refill?`
- `Black, two sugars — comin' right up.`

---

## Intro song & Outro

Not generated — these are typically commissioned tracks or royalty-free stems you choose:

- `Hello.mp3` — full intro theme (any length up to ~30 seconds reads well, longer if it's a proper opener)
- `Goodbye.mp3` — outro music bed (typically 30-90 seconds with a voice line over a bed, or just a music wind-down)

Sources:
- ElevenLabs **Music** model (newer; can compose short tracks from prompts — try it for a one-off bumper).
- Royalty-free libraries: Epidemic Sound, Artlist, Soundstripe.
- Freesound.org for CC0 stems (no attribution required).
- Or commission from a freelance producer once for a custom theme.

---

## Tips that apply to all prompts

- **"Sting"** vs **"Bumper"** vs **"Transition"** all work — model treats them similarly. **"Song"** or **"track"** drift toward longer musical ideas.
- **"Clean tail"**, **"no fade-out"**, **"ends crisp"** all help avoid the model adding 2-3 seconds of unwanted music tail past your duration limit.
- **"Broadcast quality"**, **"polished mix"** push toward usable production; without them you sometimes get hissy or muddy takes.
- **"No vocals"** is worth including unless you want the model to attempt humming or speech.
- The duration slider is honored loosely. Set it to your target. Use ElevenLabs' built-in trim handles in the player to shave the tail before downloading.
