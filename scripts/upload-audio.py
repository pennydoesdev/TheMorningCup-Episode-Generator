#!/usr/bin/env python3
"""
Upload the final rendered MP3 to the S3 audio bucket and update the
matching WordPress serve_episode draft with Apollo plugin meta keys
(_ep_audio_url, _ep_audio_r2_key, _ep_file_size, _ep_mime_type,
_ep_duration_sec, _ep_duration). After this runs, the draft is fully
populated — open it in WP admin, review, hit publish.

(The meta key is named _ep_audio_r2_key for legacy reasons in the Apollo
plugin; it stores whatever object key was used, R2 or S3.)

Usage:
    upload-audio.py <YYYY-MM-DD>

Required env vars (read from ~/Documents/The Morning Cup/.env):
    S3_ACCESS_KEY                AWS access key with PutObject on the bucket
    S3_SECRET_KEY                matching AWS secret
    S3_REGION                    e.g. us-east-1
    S3_BUCKET                    same as APOLLO_S3_BUCKET in wp-config
    S3_CF_URL                    CloudFront URL (e.g. https://d1abc.cloudfront.net)
                                 If empty, falls back to the direct S3 URL
    WP_URL                       e.g. https://thepennytribune.com
    WP_USERNAME                  e.g. systems
    WP_APP_PASSWORD              with or without spaces

Required Python deps:
    python3 -m pip install --user --break-system-packages boto3 requests
"""

import datetime
import os
import re
import subprocess
import sys
import time


# ---------------------------------------------------------------------------
# .env loader
# ---------------------------------------------------------------------------

def load_env(path: str) -> dict:
    env: dict = {}
    if not os.path.isfile(path):
        return env
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def must_env(env: dict, key: str) -> str:
    v = env.get(key) or os.environ.get(key)
    if not v:
        sys.exit(
            f"Missing env var: {key}\n"
            f"Set it in ~/Documents/The Morning Cup/.env"
        )
    return v


# ---------------------------------------------------------------------------
# Audio metadata
# ---------------------------------------------------------------------------

def ffprobe_duration_sec(path: str) -> int:
    try:
        out = subprocess.check_output(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
        return int(round(float(out)))
    except Exception as e:
        print(f"Warning: ffprobe failed ({e}); duration set to 0")
        return 0


def format_duration(seconds: int) -> str:
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


# ---------------------------------------------------------------------------
# Title reproduction (must match what the worker sets in publish.ts)
# ---------------------------------------------------------------------------

def ordinal(n: int) -> str:
    if 11 <= n % 100 <= 13:
        return f"{n}th"
    suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def title_for_date(date: str) -> str:
    months = ["January","February","March","April","May","June","July",
              "August","September","October","November","December"]
    weekdays = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    dt = datetime.datetime.strptime(date, "%Y-%m-%d")
    return f"The Morning Cup — {weekdays[dt.weekday()]}, {months[dt.month-1]} {ordinal(dt.day)}, {dt.year}"


# ---------------------------------------------------------------------------
# WordPress lookup + meta update
# ---------------------------------------------------------------------------

def get_requests():
    try:
        import requests  # noqa: F401
        return __import__("requests")
    except ImportError:
        sys.exit(
            "Missing dep: requests. Install with:\n"
            "  python3 -m pip install --user --break-system-packages requests"
        )


def find_wp_post_id(env: dict, date: str) -> int:
    requests = get_requests()
    auth = (env["WP_USERNAME"], env["WP_APP_PASSWORD"])
    base = env["WP_URL"].rstrip("/")
    full_title = title_for_date(date)

    # WP REST `search` does a fuzzy match across post fields. We pull recent
    # candidates (any status) and pick the one whose rendered title contains
    # the date string (e.g. "May 1st, 2026"). Fuzzy enough to survive the
    # em-dash quirk while precise enough not to match the wrong day.
    resp = requests.get(
        f"{base}/wp-json/wp/v2/serve_episode",
        params={
            "status": "draft,pending,private,future,publish",
            "per_page": 50,
            "orderby": "date",
            "order": "desc",
            "search": full_title.split("—")[-1].strip(),  # the date portion
        },
        auth=auth,
        timeout=30,
    )
    if resp.status_code != 200:
        sys.exit(f"WP search failed: {resp.status_code} {resp.text[:300]}")
    posts = resp.json()

    date_marker = full_title.split("—")[-1].strip().rstrip(".")
    for p in posts:
        rendered = p.get("title", {}).get("rendered", "")
        if date_marker in rendered:
            return p["id"]
        # Backup match: look for "May 1st, 2026" minus the weekday
        no_weekday = ", ".join(date_marker.split(", ")[1:])
        if no_weekday in rendered:
            return p["id"]

    sys.exit(
        f"No matching WP serve_episode found for {date}.\n"
        f"  Searched title: {full_title}\n"
        f"  Got {len(posts)} candidates back from search.\n"
        f"  Run the worker for this date first, then re-run this script."
    )


def update_wp_meta(env: dict, post_id: int, meta: dict):
    requests = get_requests()
    auth = (env["WP_USERNAME"], env["WP_APP_PASSWORD"])
    base = env["WP_URL"].rstrip("/")
    resp = requests.post(
        f"{base}/wp-json/wp/v2/serve_episode/{post_id}",
        auth=auth,
        json={"meta": meta},
        timeout=60,
    )
    if resp.status_code not in (200, 201):
        sys.exit(f"WP meta update failed: {resp.status_code} {resp.text[:400]}")


# ---------------------------------------------------------------------------
# R2 upload
# ---------------------------------------------------------------------------

def get_boto3():
    try:
        import boto3  # noqa: F401
        return __import__("boto3")
    except ImportError:
        sys.exit(
            "Missing dep: boto3. Install with:\n"
            "  python3 -m pip install --user --break-system-packages boto3"
        )


def upload_to_s3(env: dict, mp3_path: str, key: str) -> str:
    boto3 = get_boto3()
    s3 = boto3.client(
        "s3",
        aws_access_key_id=env["S3_ACCESS_KEY"],
        aws_secret_access_key=env["S3_SECRET_KEY"],
        region_name=env["S3_REGION"],
    )
    s3.upload_file(
        mp3_path,
        env["S3_BUCKET"],
        key,
        ExtraArgs={"ContentType": "audio/mpeg"},
    )
    cf = (env.get("S3_CF_URL") or "").rstrip("/")
    if cf:
        return f"{cf}/{key}"
    return f"https://{env['S3_BUCKET']}.s3.{env['S3_REGION']}.amazonaws.com/{key}"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: upload-audio.py <YYYY-MM-DD>")
    date = sys.argv[1]
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        sys.exit(f"Invalid date format: {date}")

    env_file = os.path.expanduser("~/Documents/The Morning Cup/.env")
    env = load_env(env_file)
    required = (
        "S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_REGION", "S3_BUCKET",
        "WP_URL", "WP_USERNAME", "WP_APP_PASSWORD",
    )
    for k in required:
        must_env(env, k)

    mp3_path = os.path.expanduser(
        f"~/Documents/The Morning Cup/Episodes/The Morning Cup - {date}.mp3"
    )
    if not os.path.isfile(mp3_path):
        sys.exit(f"Final episode MP3 not found: {mp3_path}")

    file_size = os.path.getsize(mp3_path)
    duration_sec = ffprobe_duration_sec(mp3_path)
    duration_str = format_duration(duration_sec)

    yyyy, mm, _ = date.split("-")
    key = f"audio/{yyyy}/{mm}/the-morning-cup-{date}-{int(time.time())}.mp3"

    print(f"→ Finding WP serve_episode draft for {date}...")
    post_id = find_wp_post_id(env, date)
    print(f"  WP post ID: {post_id}")

    print(f"→ Uploading {mp3_path}")
    print(f"     ({file_size:,} bytes, {duration_str}) to S3...")
    public_url = upload_to_s3(env, mp3_path, key)
    print(f"  Public URL: {public_url}")

    print(f"→ Updating Apollo meta on post {post_id}...")
    update_wp_meta(
        env,
        post_id,
        {
            "_ep_audio_url": public_url,
            "_ep_audio_r2_key": key,
            "_ep_file_size": file_size,
            "_ep_mime_type": "audio/mpeg",
            "_ep_duration_sec": duration_sec,
            "_ep_duration": duration_str,
        },
    )

    edit_url = (
        env["WP_URL"].rstrip("/") + f"/wp-admin/post.php?post={post_id}&action=edit"
    )
    print()
    print("✓ Audio attached to draft.")
    print(f"  Review + publish: {edit_url}")


if __name__ == "__main__":
    main()
