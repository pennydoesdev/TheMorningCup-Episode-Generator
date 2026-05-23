# Contributing to Fold 42 Podcast Infrastructure

This repository is **Fold 42 internal infrastructure**. It is not an open-source project.
Access is restricted to authorized Fold 42 staff and contractors.

---

## Who can contribute

| Role | What they can do |
|------|-----------------|
| **Fold 42 infrastructure team** | Merge to `main` after review |
| **Fold 42 developers** | Open PRs; cannot merge without approval |
| **Show producers / prompt engineers** | Open PRs for `src/prompt.ts` and `src/validator.ts` changes only |
| **External contractors** | PRs on a scoped feature branch only; no access to secrets or production |

If you do not have an assigned role, you do not have merge access. Contact your EP.

---

## Branch protection rules (apply to every forked repo)

After the first push to a new show's repository, apply these settings in
**GitHub → Settings → Branches → Add branch protection rule** for the `main` branch:

| Setting | Value |
|---------|-------|
| Require a pull request before merging | ✅ Enabled |
| Required approvals | **2** (one must be from infrastructure team) |
| Dismiss stale pull request approvals when new commits are pushed | ✅ Enabled |
| Require review from code owners | ✅ Enabled |
| Require status checks to pass before merging | ✅ Enabled |
| Require branches to be up to date before merging | ✅ Enabled |
| Do not allow bypassing the above settings | ✅ Enabled — **no exceptions** |
| Restrict who can push to matching branches | Infrastructure team only |
| Allow force pushes | ❌ Never |
| Allow deletions | ❌ Never |

**These rules must be applied before any external collaborator is added to the repo.**

---

## CODEOWNERS

Every repository must have a `.github/CODEOWNERS` file. Copy and adjust this template:

```
# All changes require infrastructure review
*                           @pennydoesdev/infrastructure

# Prompt changes also require EP sign-off
src/prompt.ts               @pennydoesdev/infrastructure @pennydoesdev/editorial
src/validator.ts            @pennydoesdev/infrastructure @pennydoesdev/editorial

# Legal/compliance docs require compliance team review
docs/COMPLIANCE.md          @pennydoesdev/infrastructure @pennydoesdev/legal
docs/AUDIT.md               @pennydoesdev/infrastructure @pennydoesdev/legal
```

---

## What can and cannot be changed in PRs

### Open to approved PRs
- `src/prompt.ts` — with EP and infrastructure approval
- `src/validator.ts` — with EP and infrastructure approval
- `wrangler.toml` — vars only (not bindings); with infrastructure approval
- `scripts/` — with infrastructure approval
- `docs/` — with EP or compliance approval as appropriate

### Locked — requires infrastructure team only
- `src/chunker.ts` — core audio pipeline; changes affect all shows
- `src/elevenlabs.ts` — TTS client; changes affect all shows
- `src/index.ts` — Worker entrypoint; changes affect all shows
- `src/openai.ts` — AI client; changes affect all shows
- `src/config.ts` — shared configuration interface
- `src/types.ts` — shared type definitions
- `src/r2.ts` — R2 storage helpers
- `src/description.ts` — metadata and disclosure generation
- `src/validator.ts` (structural changes) — word count logic, spacer logic

### Never changed by show creators
- `[[r2_buckets]]` in `wrangler.toml` — bucket is always `vicinity`
- `binding = "MORNING_CUP_BUCKET"` — binding name is fixed infrastructure
- `PUBLISHER` and `COPYRIGHT_HOLDER` — always "Fold 42"
- AI disclosure blocks in `src/description.ts`

---

## How to submit a change

1. Create a feature branch from `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b your-name/describe-change
   ```

2. Make your changes. For `src/prompt.ts` changes, test with a `force=true` run
   before opening a PR:
   ```bash
   curl -X POST "https://your-worker.workers.dev/run?force=true" \
     -H "Authorization: Bearer $RUN_SECRET"
   ```

3. Run typecheck:
   ```bash
   npm run typecheck
   ```

4. Open a PR against `main`. Describe:
   - What changed and why
   - Whether you tested it (include the episode date if so)
   - Any validation errors or unexpected behavior

5. Request review from the appropriate team members per CODEOWNERS.

6. Do not merge your own PR. Two approvals required — one from infrastructure.

---

## Forking policy

Fold 42 show repositories are forked from this one. Forks are subject to the same
branch protection rules. A fork is not an escape from these policies.

**Forks must:**
- Apply branch protection to `main` immediately after creation
- Add the `.github/CODEOWNERS` file
- Never change the `vicinity` bucket binding
- Never change `PUBLISHER` or `COPYRIGHT_HOLDER`
- Never disable the AI disclosure blocks

Forks that violate these requirements will be reviewed by infrastructure and
may have their Cloudflare access revoked.

---

## Reporting security issues

Do not open a GitHub issue for security vulnerabilities. Contact Fold 42 infrastructure
directly. Do not include API keys, secrets, or voice IDs in any issue, PR, commit
message, or public channel.
