# Morning Cup — WordPress / VNewsOS Integration Spec

**Audience:** Your WordPress / VNewsOS backend developers.  
**Purpose:** Add the Morning Cup editorial approval workflow to your **existing** VNewsOS system. No new plugin needed — this extends what you already have.

---

## Table of Contents

- [Overview](#overview)
- [How It Works — The Full Flow](#how-it-works--the-full-flow)
- [Database Changes](#database-changes)
- [REST API Endpoints to Add](#rest-api-endpoints-to-add)
- [Admin UI — Approval Desk Page](#admin-ui--approval-desk-page)
- [Episode Draft Auto-Creation](#episode-draft-auto-creation)
- [Approval Validation](#approval-validation)
- [Worker Configuration](#worker-configuration)
- [Authentication](#authentication)
- [Approval Serial Format](#approval-serial-format)
- [Stage Definitions](#stage-definitions)
- [Full Data Reference](#full-data-reference)

---

## Overview

The Morning Cup generator is a Cloudflare Worker that:

1. Fetches news sources and generates a podcast script via OpenAI
2. Writes the script to R2 cloud storage
3. **Notifies your WordPress site** that the script is ready for editorial review
4. **Waits** for an editorial approve or reject call from WordPress
5. On approval, runs ElevenLabs TTS to produce the audio chunks
6. **Notifies your WordPress site again** when audio is generated
7. WordPress imports the episode as a `vicinity_podcast` CPT draft

Your team needs to add the receiving/sending side of this into your existing VNewsOS WordPress codebase.

---

## How It Works — The Full Flow

```
[Cloudflare Worker]                         [Your WordPress / VNewsOS]
        |                                               |
        |  POST /wp-json/mc-approval/v1/notify         |
        |  (script ready, R2 keys, metadata)           |
        |---------------------------------------------->|
        |                                    Store in DB, show in UI
        |                                    Editor reads script in browser
        |                                    (GET /worker/script?date=)
        |                                               |
        |  POST /worker-url/approve                     |
        |  (approval serial, approver name, notes)      |
        |<----------------------------------------------|
        |                                               |
    Runs TTS                                            |
        |                                               |
        |  POST /wp-json/mc-approval/v1/notify-generated|
        |  (chunk count, manifest key, files key)       |
        |---------------------------------------------->|
        |                                    Auto-create vicinity_podcast draft
        |                                    Status → "Generated"
        |                                    Editor finalizes and publishes
```

---

## Database Changes

Add one table to your existing schema (or add these columns to an existing episode-management table if you have one):

```sql
CREATE TABLE IF NOT EXISTS {prefix}mc_approval (
    id                       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    episode_date             VARCHAR(10)   NOT NULL,      -- YYYY-MM-DD
    episode_title            TEXT,
    stage                    VARCHAR(20)   NOT NULL DEFAULT 'first_draft',
    word_count               INT           DEFAULT 0,
    estimated_runtime_minutes FLOAT        DEFAULT 0,

    -- R2 storage keys (passed back to the worker or fetched for preview)
    serialized_script_key    TEXT,          -- HTML review document in R2
    json_key                 TEXT,          -- episode.json in R2
    txt_key                  TEXT,          -- plain text script in R2
    metadata_key             TEXT,          -- Metadata.txt (WP import document)
    sidecar_key              TEXT,          -- audit sidecar JSON in R2
    manifest_key             TEXT,          -- filled in after TTS completes
    files_txt_key            TEXT,          -- filled in after TTS completes

    -- Worker callback URL (stored per episode, used to call /approve or /reject)
    worker_url               TEXT,

    -- Revision log — JSON array of {timestamp, user, action, notes} objects
    revision_log             LONGTEXT,

    -- Approval fields
    approval_serial          VARCHAR(50),   -- e.g. MC-2026-0524-001-A
    approver_wp_user_id      BIGINT UNSIGNED,
    approver_name            TEXT,
    approver_declaration     TINYINT(1)    DEFAULT 0,
    approval_notes           TEXT,
    approved_at              DATETIME,

    -- Rejection fields
    rejected_at              DATETIME,
    rejection_reason         TEXT,

    -- Post-TTS fields
    chunk_count              INT           DEFAULT 0,
    generated_at             DATETIME,

    -- Final publishing
    wp_post_id               BIGINT UNSIGNED,  -- ID of the vicinity_podcast draft created
    finalized_at             DATETIME,

    created_at               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_episode_date (episode_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Allowed `stage` values** (in order):
`first_draft` → `reviewing` → `edited` → `approved` → `generated` → `finalized`

---

## REST API Endpoints to Add

Register these under the `mc-approval/v1` namespace in your existing REST API bootstrap, using `register_rest_route()`.

---

### `POST /wp-json/mc-approval/v1/notify`

**Called by:** Cloudflare Worker when a script is ready for review.  
**Auth:** WordPress Application Password (Basic `{user}:{app-password}` in Authorization header).

**Request body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `episode_date` | string | `YYYY-MM-DD` |
| `episode_title` | string | AI-generated episode title |
| `word_count` | int | Validated word count |
| `estimated_runtime_minutes` | float | Estimated audio runtime |
| `serialized_script_key` | string | R2 key for the HTML review document |
| `json_key` | string | R2 key for episode JSON |
| `txt_key` | string | R2 key for plain-text script |
| `metadata_key` | string | R2 key for Metadata.txt (WP import doc) |
| `sidecar_key` | string | R2 key for audit sidecar JSON |
| `worker_url` | string | Worker base URL (used to call `/approve` or `/reject`) |

**What your handler must do:**

1. Validate the Application Password (WP core handles this if you check `current_user_can`).
2. Upsert a row in `{prefix}mc_approval` with the fields above.
3. Set `stage = 'first_draft'`.
4. Append to `revision_log`: `{ timestamp, action: "script_received", word_count }`.
5. Return `{ success: true, episode_date }` with HTTP 200.
6. Optionally send an admin email notification.

**Example response:**
```json
{ "success": true, "episode_date": "2026-05-24" }
```

---

### `POST /wp-json/mc-approval/v1/notify-generated`

**Called by:** Cloudflare Worker after TTS is complete.  
**Auth:** WordPress Application Password.

**Request body (JSON):**

| Field | Type | Description |
|-------|------|-------------|
| `episode_date` | string | `YYYY-MM-DD` |
| `chunk_count` | int | Number of audio chunks produced |
| `manifest_key` | string | R2 key for the episode manifest JSON |
| `files_txt_key` | string | R2 key for the files.txt chunk list |

**What your handler must do:**

1. Look up the row by `episode_date`.
2. Update `manifest_key`, `files_txt_key`, `chunk_count`, `generated_at = NOW()`.
3. Set `stage = 'generated'`.
4. Append to `revision_log`: `{ timestamp, action: "tts_complete", chunk_count }`.
5. If auto-draft is enabled: call the episode draft creator (see [Episode Draft Auto-Creation](#episode-draft-auto-creation)).
6. Return `{ success: true }`.

---

### `GET /wp-json/mc-approval/v1/episodes`

**Called by:** Your Approval Desk admin UI (AJAX).  
**Auth:** WordPress nonce or logged-in admin user.

Returns a paginated list of approval records.

**Query params:** `page`, `per_page`, `stage` (filter), `date` (filter).

**Response:**
```json
{
  "episodes": [
    {
      "id": 1,
      "episode_date": "2026-05-24",
      "episode_title": "Episode Title Here",
      "stage": "reviewing",
      "word_count": 2450,
      "estimated_runtime_minutes": 16.9,
      "approval_serial": null,
      "created_at": "2026-05-24T09:00:00Z",
      "updated_at": "2026-05-24T09:00:00Z"
    }
  ],
  "total": 10,
  "pages": 1
}
```

---

### `GET /wp-json/mc-approval/v1/episode/{date}`

**Auth:** Logged-in admin.

Returns the full record for a single episode date (`YYYY-MM-DD`). Includes all fields, revision log, and current stage.

---

### `POST /wp-json/mc-approval/v1/episode/{date}/stage`

**Called by:** Your Approval Desk UI when an editor changes the stage manually.  
**Auth:** Logged-in admin + nonce.

**Body:** `{ "stage": "reviewing" }`  
Only allows forward-only stage changes (no going backward past `approved`).

---

### `POST /wp-json/mc-approval/v1/episode/{date}/approve`

**Called by:** Your Approval Desk UI when an editor clicks "Approve & Send to Audio".  
**Auth:** Logged-in admin + nonce.  
**Required capability:** `edit_posts` (or a custom `mc_approve_episodes` cap if you want granular control).

**Body:**
```json
{
  "approver_name": "Jane Smith",
  "approval_notes": "Approved with minor edits to weather section.",
  "approver_declaration": true
}
```

**What your handler must do:**

1. Validate `approver_declaration === true` — required checkbox.
2. Look up the row; confirm `stage` is `'reviewing'` or `'edited'`.
3. Generate an approval serial (see [Approval Serial Format](#approval-serial-format)).
4. Update the row: `stage = 'approved'`, `approved_at = NOW()`, `approval_serial`, `approver_wp_user_id`, `approver_name`, `approver_declaration = 1`, `approval_notes`.
5. Append to `revision_log`: `{ timestamp, user_id, user_name, action: "approved", serial, notes }`.
6. **Call the worker's `/approve` endpoint:**
   ```
   POST {worker_url}/approve
   Authorization: Bearer {RUN_SECRET}
   Content-Type: application/json

   {
     "date": "2026-05-24",
     "approver_name": "Jane Smith",
     "approver_serial": "MC-2026-0524-001-A",
     "approval_notes": "Approved with minor edits to weather section."
   }
   ```
7. Return `{ success: true, approval_serial: "MC-2026-0524-001-A" }`.

**Store the `RUN_SECRET` in WordPress as an option (encrypted or in wp-config.php constants)** — never in the database in plain text if avoidable.

---

### `POST /wp-json/mc-approval/v1/episode/{date}/reject`

**Called by:** Your Approval Desk UI.  
**Auth:** Logged-in admin + nonce.

**Body:**
```json
{
  "rejection_reason": "Script is too focused on national politics; needs more local angle."
}
```

**What your handler must do:**

1. Update: `stage = 'first_draft'` (sends back to start), `rejected_at = NOW()`, `rejection_reason`.
2. Append to `revision_log`: `{ timestamp, user_id, action: "rejected", reason }`.
3. **Call the worker's `/reject` endpoint:**
   ```
   POST {worker_url}/reject
   Authorization: Bearer {RUN_SECRET}
   Content-Type: application/json

   { "date": "2026-05-24", "reason": "Script is too focused on national politics..." }
   ```
4. Return `{ success: true }`.

---

## Admin UI — Approval Desk Page

Add an **"Approval Desk"** page to your existing VNewsOS admin menu (or under the existing Podcasts menu). This is a standard WP admin page — no React build needed unless your team prefers it.

### Page layout

**Tabs/sections:**
1. **Pending Review** — episodes in `first_draft` or `reviewing` or `edited`
2. **Approved** — episodes in `approved` or `generated`
3. **Finalized** — episodes in `finalized`
4. **Rejected** — episodes with a `rejected_at` date

### Episode list columns

| Column | Content |
|--------|---------|
| Date | Episode date (link to detail view) |
| Title | Episode title |
| Stage | Color-coded badge |
| Runtime | Estimated runtime (e.g. 16m 54s) |
| Words | Word count |
| Approval Serial | Once approved |
| Actions | View Script, Approve, Reject, View Audio |

### Episode detail view

When an editor clicks an episode, show:

1. **Stage bar** at the top — 6 steps, current step highlighted:
   ```
   [First Draft] → [Reviewing] → [Edited] → [Approved] → [Generated] → [Finalized]
   ```

2. **Script preview iframe** — embed the worker's script HTML:
   ```
   GET {worker_url}/script?date=YYYY-MM-DD
   Authorization: Bearer {RUN_SECRET}
   ```
   The worker returns the full HTML review document. You can show it in an `<iframe>` or fetch and insert it into a `<div>`.

3. **Episode metadata panel** (right sidebar):
   - Episode date
   - Word count
   - Estimated runtime
   - Created at
   - R2 keys (collapsed/advanced)

4. **Revision log** — timeline of all actions with timestamps and user names.

5. **Approval form** (shown when stage is `reviewing` or `edited`):
   - Textarea: "Approval Notes" (optional)
   - Checkbox: **"I confirm this script has been reviewed and is approved for audio production."** (required)
   - Button: **"Approve & Send to Audio"** (calls your `/approve` endpoint above)

6. **Rejection form** (shown when stage is `reviewing` or `edited`):
   - Textarea: "Rejection Reason" (required)
   - Button: **"Reject Script"** (calls your `/reject` endpoint above)

7. **Inline section notes** (optional enhancement):
   - If your team wants Grammarly-style per-section commenting, store comments in `revision_log` with `{ action: "section_note", section_index, text }`.
   - Not required for the approval flow to work.

### Stage badge colors

| Stage | Color |
|-------|-------|
| `first_draft` | Gray |
| `reviewing` | Blue |
| `edited` | Purple |
| `approved` | Green |
| `generated` | Teal |
| `finalized` | Dark green |
| Rejected | Red |

---

## Episode Draft Auto-Creation

When `notify-generated` is received (TTS complete), your handler can automatically create a `vicinity_podcast` CPT draft pre-populated from the Metadata.txt file.

### How to get Metadata.txt

```
GET {worker_url}/sidecar?date=YYYY-MM-DD
Authorization: Bearer {RUN_SECRET}
```

Wait — Metadata.txt is at the `metadata_key` R2 path. Since you don't have direct R2 access, read it via the worker:

```
GET {worker_url}/script?date=YYYY-MM-DD
```
returns the HTML review doc.

For the structured metadata, parse the sidecar JSON:
```
GET {worker_url}/sidecar?date=YYYY-MM-DD
Authorization: Bearer {RUN_SECRET}
```

The sidecar contains: episode_date, episode_title, word_count, estimated_runtime_minutes, chunk_count, source_notes, chapters.

Alternatively, you can fetch the raw Metadata.txt by adding an endpoint to the worker — but the sidecar JSON is easier to parse.

### What to populate in the WP draft

Use `wp_insert_post()` with these values from the sidecar:

| WP field / meta | Value |
|-----------------|-------|
| `post_title` | Episode title from sidecar |
| `post_status` | `'draft'` |
| `post_type` | `'vicinity_podcast'` |
| `post_content` | Generated show notes / description |
| `_vicinity_podcast_id` | `WORDPRESS_PODCAST_ID` (from your config) |
| `_vicinity_audio_url` | `{AUDIO_CDN_BASE_URL}/{episode_date}.mp3` |
| `_vnews_ep_audio_url` | `{AUDIO_CDN_BASE_URL_LEGACY}/{episode_date}.mp3` |
| `_vicinity_episode_date` | `episode_date` |
| `_vicinity_runtime` | Formatted runtime string |
| `_vnews_ep_word_count` | word_count |
| `_vnews_ep_approval_serial` | approval_serial |
| `_vnews_ep_approved_by` | approver_name |
| `_vnews_ep_chunk_count` | chunk_count |

Store the created post ID back in `{prefix}mc_approval.wp_post_id`.

When the editor publishes the draft, set `stage = 'finalized'` and `finalized_at = NOW()` — you can hook into `transition_post_status` for this:

```php
add_action( 'transition_post_status', function( $new_status, $old_status, $post ) {
    if ( $post->post_type !== 'vicinity_podcast' ) return;
    if ( $new_status !== 'publish' ) return;

    // Look up mc_approval row by wp_post_id and mark finalized
    global $wpdb;
    $wpdb->update(
        $wpdb->prefix . 'mc_approval',
        [
            'stage'        => 'finalized',
            'finalized_at' => current_time( 'mysql', true ),
        ],
        [ 'wp_post_id' => $post->ID ],
        [ '%s', '%s' ],
        [ '%d' ]
    );
}, 10, 3 );
```

---

## Approval Validation

Before allowing a `vicinity_podcast` post to be published, validate:

1. The `wp_post_id` has a matching row in `{prefix}mc_approval`.
2. That row's `stage` is `'generated'` or `'finalized'` (not `'first_draft'` or `'reviewing'`).
3. `approver_declaration = 1` and `approval_serial` is not null.

If validation fails, block publishing and show an admin notice:

```
⚠ This episode has not been approved by the Approval Desk. Stage: reviewing.
Go to Approval Desk → [episode date] to complete the review.
```

Hook into `wp_insert_post_data` or use a `save_post_{vicinity_podcast}` hook to check.

---

## Worker Configuration

These Cloudflare Worker vars need to be set in `wrangler.toml` (already done — see the repo):

```toml
WORDPRESS_SITE_URL = "https://thefold42.com"
WORDPRESS_APP_USER = "systems"
WORKER_PUBLIC_URL  = "https://themorningcupgenerator.itsmiarosemathews.workers.dev"
```

The `WORDPRESS_APP_PASSWORD` is a **Cloudflare secret** — never in wrangler.toml:
```bash
npx wrangler secret put WORDPRESS_APP_PASSWORD
```

To enable the approval gate (pause before TTS and wait for WordPress approval):
```toml
ENABLE_APPROVAL_GATE = "true"
```

When `false` (default), the worker runs TTS immediately and still notifies WordPress afterward — WordPress gets the metadata and can auto-create a draft, but editorial approval happens after the fact.

---

## Authentication

### Worker → WordPress

The worker calls WordPress REST endpoints using **WordPress Application Password** (RFC 7617 Basic auth):

```
Authorization: Basic base64("{wp_app_user}:{app_password}")
```

Create the Application Password in WordPress:
1. WP Admin → Users → {the service account user} → Application Passwords
2. Name it "Morning Cup Worker"
3. Copy the generated password
4. Set it as a Cloudflare secret: `npx wrangler secret put WORDPRESS_APP_PASSWORD`

Your REST handlers must verify the caller is authenticated. The simplest approach: use `current_user_can( 'edit_posts' )` after WP core processes the Basic auth header — WP 5.6+ does this automatically for Application Passwords.

### WordPress → Worker

WordPress calls the worker's `/approve` and `/reject` endpoints using the **RUN_SECRET** Bearer token:

```
Authorization: Bearer {RUN_SECRET}
```

Store `RUN_SECRET` in WordPress as a constant in `wp-config.php` or as a WordPress option. Do **not** hardcode it in plugin PHP or commit it to git.

Example `wp-config.php` constant approach:
```php
define( 'MC_WORKER_RUN_SECRET', 'your-secret-here' );
```

Then in your REST handler:
```php
$run_secret = defined( 'MC_WORKER_RUN_SECRET' ) ? MC_WORKER_RUN_SECRET : get_option( 'mc_worker_run_secret' );
wp_remote_post( $worker_url . '/approve', [
    'headers' => [
        'Authorization' => 'Bearer ' . $run_secret,
        'Content-Type'  => 'application/json',
    ],
    'body'    => wp_json_encode( $payload ),
    'timeout' => 30,
] );
```

---

## Approval Serial Format

Generate one per approval:

```
MC-YYYY-MMDD-NNN-A
```

- `MC` — Morning Cup prefix (hardcoded)
- `YYYY` — 4-digit year
- `MMDD` — 2-digit month + 2-digit day of the episode date
- `NNN` — 3-digit sequential counter for that day (001, 002, …), stored in a WP option `mc_approval_counter_{YYYY-MM-DD}`
- `A` — suffix letter (A = initial approval; B, C, … for re-approvals after rejection)

```php
function mc_generate_approval_serial( string $episode_date ): string {
    $counter_key = 'mc_approval_counter_' . $episode_date;
    $counter     = (int) get_option( $counter_key, 0 ) + 1;
    update_option( $counter_key, $counter );

    $date_part = str_replace( '-', '', substr( $episode_date, 0, 7 ) ); // YYYYMM
    $day_part  = substr( $episode_date, 8, 2 );                          // DD
    return sprintf( 'MC-%s%s-%03d-A', $date_part, $day_part, $counter );
    // → MC-2026-0524-001-A
}
```

---

## Stage Definitions

| Stage | Meaning | Who sets it |
|-------|---------|-------------|
| `first_draft` | Script received from worker, not yet opened | Worker via `notify` |
| `reviewing` | Editor has opened the script | UI (auto on first open, or manual) |
| `edited` | Editor made inline notes or corrections | UI (editor action) |
| `approved` | Editorial approval given, worker notified | UI approve button → worker `/approve` |
| `generated` | Worker has completed TTS, audio is ready | Worker via `notify-generated` |
| `finalized` | WP episode post published | WP `transition_post_status` hook |

---

## Full Data Reference

### Worker endpoints your WordPress code calls

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `{worker_url}/approve` | POST | Approve script, trigger TTS |
| `{worker_url}/reject` | POST | Reject script, abort run |
| `{worker_url}/script?date=YYYY-MM-DD` | GET | Fetch serialized script HTML for preview |
| `{worker_url}/sidecar?date=YYYY-MM-DD` | GET | Fetch sidecar audit JSON |
| `{worker_url}/status?date=YYYY-MM-DD` | GET | Get current run status |

All worker endpoints require `Authorization: Bearer {RUN_SECRET}`.

### Approval request body (POST `/approve`)

```json
{
  "date": "2026-05-24",
  "approver_name": "Jane Smith",
  "approver_serial": "MC-2026-0524-001-A",
  "approval_notes": "Looks good. Minor weather edit noted."
}
```

### Rejection request body (POST `/reject`)

```json
{
  "date": "2026-05-24",
  "reason": "Too much national focus; needs more local angle."
}
```

### WordPress REST endpoints your UI calls

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `mc-approval/v1/notify` | POST | Worker → WP: script ready |
| `mc-approval/v1/notify-generated` | POST | Worker → WP: TTS complete |
| `mc-approval/v1/episodes` | GET | List all approval records |
| `mc-approval/v1/episode/{date}` | GET | Get single record |
| `mc-approval/v1/episode/{date}/stage` | POST | Manually advance stage |
| `mc-approval/v1/episode/{date}/approve` | POST | Approve + call worker |
| `mc-approval/v1/episode/{date}/reject` | POST | Reject + call worker |

---

*This spec describes the integration contract between The Morning Cup Cloudflare Worker and your existing VNewsOS WordPress system. Your development team implements the WordPress side; the worker side is already built and deployed.*
