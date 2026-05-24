# Contributing to The Morning Cup — Fold 42 Infrastructure

## Table of Contents

- [Who Can Contribute](#who-can-contribute)
- [Access Control](#access-control)
- [Branch Protection Rules](#branch-protection-rules)
- [What Can and Cannot Be Changed](#what-can-and-cannot-be-changed)
- [How to Submit a Change](#how-to-submit-a-change)
- [Team Onboarding](#team-onboarding)
- [Offboarding](#offboarding)
- [Secret Management](#secret-management)
- [Forking Policy](#forking-policy)
- [Reporting Security Issues](#reporting-security-issues)

---

## Who Can Contribute

This repository is **Fold 42 internal infrastructure**. It is not an open-source project.
Access is restricted to authorized Fold 42 staff and contractors.

| Role | What they can do |
|------|-----------------|
| **@pennydoesdev** | Full access — merge to any branch, delete KV records, rotate secrets |
| **Fold 42 infrastructure team** | Open PRs and merge after @pennydoesdev approval |
| **Show producers / prompt engineers** | Open PRs for `src/prompt.ts` changes only |
| **External contractors** | PRs on a scoped feature branch only; no access to secrets |

**Only @pennydoesdev can:**
- Merge to `main` or any production branch
- Delete KV run records
- Rotate or modify Cloudflare Worker Secrets
- Modify `.github/CODEOWNERS` or branch protection rules
- Approve changes to `wrangler.toml` bindings

[↑ Back to top](#table-of-contents)

---

## Access Control

### GitHub

All changes require review and approval from **@pennydoesdev** via pull request.
Direct pushes to `main` are blocked.

### Cloudflare

Secrets are set via `wrangler secret put` and are never stored in code.
Access to the Cloudflare account is restricted to @pennydoesdev.

### KV Records

Episode run records in Cloudflare KV may only be deleted by:
```bash
# Only authorized personnel should run this
npx wrangler kv key delete --remote \
  --binding MORNING_CUP_KV \
  "morning-cup/YYYY-MM-DD/run.json"
```

[↑ Back to top](#table-of-contents)

---

## Branch Protection Rules

Apply in **GitHub → Settings → Branches → Add rule** for `main`:

| Setting | Value |
|---------|-------|
| Require pull request before merging | ✅ |
| Required approvals | **1 — must be @pennydoesdev** |
| Dismiss stale reviews on new commits | ✅ |
| Require review from Code Owners | ✅ |
| Require status checks to pass | ✅ |
| Require branches to be up to date | ✅ |
| Do not allow bypassing | ✅ — **no exceptions** |
| Allow force pushes | ❌ Never |
| Allow deletions | ❌ Never |

**Apply these rules before adding any external collaborator.**

[↑ Back to top](#table-of-contents)

---

## What Can and Cannot Be Changed

### Open to approved PRs (with @pennydoesdev sign-off)
- `src/prompt.ts` — editorial/content policy changes
- `wrangler.toml` — variable values only (not bindings)
- `scripts/` — pipeline script improvements
- `docs/` — documentation updates
- `data/pronunciation-dictionary.json` — pronunciation additions

### Infrastructure — @pennydoesdev only
- `src/index.ts` — Worker entrypoint
- `src/openai.ts` — AI API client
- `src/elevenlabs.ts` / `src/tts.ts` — TTS pipeline
- `src/chunker.ts` — audio chunking
- `src/r2.ts` / `src/locks.ts` — storage layer
- `src/config.ts` / `src/types.ts` — shared interfaces
- `src/factcheck.ts` — fact-checking logic
- `src/validator.ts` — validation rules
- `.github/CODEOWNERS` — this file

### Never changed by anyone
- `[[r2_buckets]]` binding — always `vicinity`
- `PUBLISHER` / `COPYRIGHT_HOLDER` — always "Fold 42"
- AI disclosure blocks in `src/description.ts`
- `src/schema.ts` — OpenAI Responses JSON schema

[↑ Back to top](#table-of-contents)

---

## How to Submit a Change

1. **Create a feature branch:**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b yourname/describe-change
   ```

2. **Make changes. For prompt changes, test with a force run:**
   ```bash
   cd ~/Documents/"The Morning Cup"/Generator
   ./scripts/morning-cup.sh make --force
   ```

3. **Run typecheck before pushing:**
   ```bash
   npx tsc --noEmit
   ```

4. **Push and open a PR:**
   ```bash
   git push -u origin yourname/describe-change
   ```
   In the PR description, include:
   - What changed and why
   - Whether you tested it (include the episode date)
   - Any validation errors or unexpected behavior

5. **Request review from @pennydoesdev.**

6. **Do not merge your own PR.** Wait for approval.

[↑ Back to top](#table-of-contents)

---

## Team Onboarding

### Automated (recommended)

New team member runs the install script:
```bash
# macOS / Linux / WSL
bash <(curl -fsSL https://raw.githubusercontent.com/pennydoesdev/TheMorningCup-Episode-Generator/main/scripts/install.sh)
```

Or clone first, then run:
```bash
cd ~/Documents/"The Morning Cup"/Generator
bash scripts/install.sh
```

This installs all dependencies, creates the folder structure, and sets up the desktop applet.

### Manual onboarding checklist

1. **Access** — Add collaborator on GitHub with "Write" role (not Admin)
2. **Clone:**
   ```bash
   mkdir -p "$HOME/Documents/The Morning Cup"
   cd "$HOME/Documents/The Morning Cup"
   git clone https://github.com/pennydoesdev/TheMorningCup-Episode-Generator.git Generator
   cd Generator && npm install
   ```
3. **Secrets** — Share via 1Password or secure channel (never Slack/email):
   - `RUN_SECRET` — the Bearer token for the worker
   - Do NOT share: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY` — these stay with @pennydoesdev
4. **Sound assets** — Share the `Sounds/` folder contents via the shared Drive folder
5. **Test run:**
   ```bash
   ./scripts/morning-cup.sh preflight
   ```

### What each team member needs in their `.env`
```
WORKER_URL=https://themorningcupgenerator.itsmiarosemathews.workers.dev
RUN_SECRET=<from @pennydoesdev>
```

Team members do NOT need `OPENAI_API_KEY` or `ELEVENLABS_API_KEY` locally
— those are Cloudflare Worker Secrets and never leave the cloud.

[↑ Back to top](#table-of-contents)

---

## Offboarding

When a team member leaves:

1. **Remove from GitHub** — Settings → Collaborators → Remove
2. **Rotate RUN_SECRET** — generate a new one and update:
   ```bash
   # Update Cloudflare Worker secret
   npx wrangler secret put RUN_SECRET
   # Update your own .env
   # Notify remaining team members of the new value
   ```
3. **Audit recent pushes** — review git log for any changes in their last week
4. **Revoke Cloudflare access** — if they had direct Cloudflare account access
5. **Check KV records** — verify no unauthorized runs or deletions in recent logs:
   ```bash
   npx wrangler tail --format=pretty
   ```

[↑ Back to top](#table-of-contents)

---

## Secret Management

### The rules
- **Secrets are NEVER committed to git** — not in wrangler.toml, not in comments, not in docs
- **Secrets live in two places only:**
  1. Cloudflare Worker Secrets (set via `wrangler secret put`)
  2. Local `~/Documents/The Morning Cup/.env` file (in `.gitignore`)
- **Rotation:** rotate secrets immediately if they appear in a commit, PR, or chat message

### Setting secrets (Cloudflare)
```bash
cd ~/Documents/"The Morning Cup"/Generator
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_VOICE_ID
npx wrangler secret put RUN_SECRET
```

### Checking which secrets are set (without revealing values)
```bash
npx wrangler secret list
```

### The .env file (local only)
```
WORKER_URL=https://themorningcupgenerator.itsmiarosemathews.workers.dev
RUN_SECRET=<value>
# Optional — only if running local generation scripts:
OPENAI_API_KEY=<value>
ELEVENLABS_API_KEY=<value>
ELEVENLABS_VOICE_ID=<value>
```

[↑ Back to top](#table-of-contents)

---

## Forking Policy

Fold 42 show repositories are forked from this one. All forks must:

- Apply branch protection to `main` immediately after creation
- Add `.github/CODEOWNERS` pointing to @pennydoesdev
- Never change the `vicinity` bucket binding
- Never change `PUBLISHER` or `COPYRIGHT_HOLDER` from "Fold 42"
- Never disable AI disclosure blocks in `src/description.ts`
- Apply all branch protection settings listed above

Forks that violate these requirements will have their Cloudflare access reviewed and may be revoked.

[↑ Back to top](#table-of-contents)

---

## Reporting Security Issues

**Do not open a GitHub issue for security vulnerabilities.**

Contact @pennydoesdev directly. Do not include API keys, secrets, voice IDs, or
KV key names in any issue, PR, commit message, public channel, or shared document.

If a secret has been exposed in a commit or PR, rotate it immediately before doing anything else.

[↑ Back to top](#table-of-contents)
