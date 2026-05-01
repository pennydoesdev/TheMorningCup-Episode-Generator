#!/usr/bin/env python3
"""
Push the final rendered episode MP3 into the same Google Drive folder the
worker created. Looks for the YYYY-MM-DD subfolder under
GOOGLE_DRIVE_FOLDER_ID, creates it if missing, and uploads / replaces the
final MP3 there.

Auth: service account JSON at GOOGLE_DRIVE_KEY_PATH (defaults to
~/Documents/The Morning Cup/.secrets/google-drive-key.json).

Usage:
    push-final-to-drive.py <mp3_path> <YYYY-MM-DD>
"""

import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request


DEFAULT_KEY_PATH = os.path.expanduser(
    "~/Documents/The Morning Cup/.secrets/google-drive-key.json"
)
ROOT_FOLDER_ID = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
KEY_PATH = os.environ.get("GOOGLE_DRIVE_KEY_PATH", DEFAULT_KEY_PATH)


def load_key():
    if not os.path.isfile(KEY_PATH):
        sys.exit(
            f"Service account JSON not found at {KEY_PATH}. "
            "Set GOOGLE_DRIVE_KEY_PATH or place it at the default path."
        )
    with open(KEY_PATH) as f:
        return json.load(f)


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def get_access_token(key: dict) -> str:
    # Build and sign a JWT for the OAuth2 service-account flow.
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
    except ImportError:
        sys.exit(
            "Missing dependency: cryptography. Install with:\n"
            "  python3 -m pip install --user --break-system-packages cryptography"
        )

    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claims = {
        "iss": key["client_email"],
        "scope": "https://www.googleapis.com/auth/drive",
        "aud": key.get("token_uri", "https://oauth2.googleapis.com/token"),
        "exp": now + 3600,
        "iat": now,
    }
    unsigned = (
        b64url(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + b64url(json.dumps(claims, separators=(",", ":")).encode())
    )
    pem = key["private_key"].encode()
    private_key = serialization.load_pem_private_key(pem, password=None)
    signature = private_key.sign(
        unsigned.encode(),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    jwt = unsigned + "." + b64url(signature)

    body = urllib.parse.urlencode(
        {
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": jwt,
        }
    ).encode()
    req = urllib.request.Request(
        claims["aud"],
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    return data["access_token"]


def http_json(method: str, url: str, token: str, body=None, content_type=None):
    headers = {"Authorization": f"Bearer {token}"}
    if body is not None and content_type:
        headers["Content-Type"] = content_type
    if isinstance(body, (dict, list)):
        body = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def find_or_create_folder(token: str, name: str, parent_id: str) -> str:
    safe = name.replace("'", "\\'")
    q = (
        f"'{parent_id}' in parents and name = '{safe}' and "
        f"mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )
    url = (
        "https://www.googleapis.com/drive/v3/files?"
        + urllib.parse.urlencode(
            {
                "q": q,
                "fields": "files(id,name)",
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
        )
    )
    found = http_json("GET", url, token).get("files", [])
    if found:
        return found[0]["id"]
    create_url = (
        "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true"
    )
    created = http_json(
        "POST",
        create_url,
        token,
        body={
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        },
    )
    return created["id"]


def find_existing_file(token: str, name: str, parent_id: str):
    safe = name.replace("'", "\\'")
    q = f"'{parent_id}' in parents and name = '{safe}' and trashed = false"
    url = (
        "https://www.googleapis.com/drive/v3/files?"
        + urllib.parse.urlencode(
            {
                "q": q,
                "fields": "files(id,name)",
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
        )
    )
    found = http_json("GET", url, token).get("files", [])
    return found[0]["id"] if found else None


def upload_file(token: str, folder_id: str, path: str):
    name = os.path.basename(path)
    with open(path, "rb") as f:
        content = f.read()

    existing_id = find_existing_file(token, name, folder_id)

    boundary = "morningcup_python_boundary"
    metadata = {"name": name}
    if existing_id is None:
        metadata["parents"] = [folder_id]

    head = (
        f"--{boundary}\r\n"
        f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{json.dumps(metadata)}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: audio/mpeg\r\n\r\n"
    ).encode()
    tail = f"\r\n--{boundary}--".encode()
    body = head + content + tail

    if existing_id:
        url = (
            f"https://www.googleapis.com/upload/drive/v3/files/{existing_id}"
            f"?uploadType=multipart&supportsAllDrives=true"
        )
        method = "PATCH"
    else:
        url = (
            "https://www.googleapis.com/upload/drive/v3/files"
            "?uploadType=multipart&supportsAllDrives=true"
        )
        method = "POST"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/related; boundary={boundary}",
        "Content-Length": str(len(body)),
    }
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=600) as resp:
        return json.loads(resp.read())


def main():
    if len(sys.argv) < 3:
        sys.exit("Usage: push-final-to-drive.py <mp3_path> <YYYY-MM-DD>")
    mp3_path = os.path.expanduser(sys.argv[1])
    date = sys.argv[2]

    if not os.path.isfile(mp3_path):
        sys.exit(f"File not found: {mp3_path}")
    if not ROOT_FOLDER_ID:
        sys.exit("GOOGLE_DRIVE_FOLDER_ID not set in environment.")

    key = load_key()
    token = get_access_token(key)
    date_folder = find_or_create_folder(token, date, ROOT_FOLDER_ID)
    result = upload_file(token, date_folder, mp3_path)
    print(
        f"Uploaded {os.path.basename(mp3_path)} -> "
        f"https://drive.google.com/file/d/{result['id']}/view"
    )


if __name__ == "__main__":
    main()
