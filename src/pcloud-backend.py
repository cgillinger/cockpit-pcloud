#!/usr/bin/env python3
"""
pcloud-backend.py — Backend script for cockpit-pcloud plugin.
Reads pCloud token from config, queries pCloud API, returns JSON to stdout.

Usage:
  python3 pcloud-backend.py [--skip-folders] [--force-refresh]

Arguments:
  --skip-folders    Skip the recursive folder listing (expensive operation).
                    Use when Folder Sizes card is hidden in the frontend.
  --force-refresh   Bypass the server-side cache and fetch fresh data.
"""

import configparser
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


CACHE_FILE = "/tmp/cockpit-pcloud-cache.json"
DEFAULT_CACHE_SECONDS = 300

CONFIG_PATHS = [
    "/etc/cockpit/pcloud.conf",
    os.path.expanduser("~/.config/cockpit/pcloud.conf"),
]

API_HOSTS = {
    "eu": "https://eapi.pcloud.com",
    "us": "https://api.pcloud.com",
}

TIMEOUT = 10


def output_json(data):
    """Print JSON to stdout and exit."""
    print(json.dumps(data))
    sys.exit(0)


def output_error(error_code, message):
    """Print error JSON to stdout and exit."""
    output_json({
        "status": "error",
        "error": error_code,
        "message": message,
    })


def read_config():
    """Read configuration from the first available config file."""
    config = configparser.ConfigParser()
    for path in CONFIG_PATHS:
        if os.path.isfile(path):
            try:
                config.read(path)
                if config.has_section("pcloud"):
                    return config
            except configparser.Error:
                continue
    return None


def _sanitize_error(message, token):
    """Remove access token from error messages to prevent leaks."""
    if token and token in str(message):
        return str(message).replace(token, "***")
    return str(message)


def api_request(host, endpoint, token):
    """Make a GET request to the pCloud API. Exits the process on error."""
    sep = "&" if "?" in endpoint else "?"
    url = "{}/{}{}access_token={}".format(host, endpoint, sep, token)
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        output_error("api_error", "HTTP {} {}".format(e.code, e.reason))
    except urllib.error.URLError as e:
        output_error("network_error", _sanitize_error(e.reason, token))
    except Exception as e:
        output_error("network_error", _sanitize_error(e, token))


def api_request_safe(host, endpoint, token):
    """Make a GET request to the pCloud API. Returns (data, error_str) tuple.
    Never exits the process — use for optional/non-critical API calls.
    """
    sep = "&" if "?" in endpoint else "?"
    url = "{}/{}{}access_token={}".format(host, endpoint, sep, token)
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8")), None
    except socket.timeout:
        return None, "timeout"
    except urllib.error.URLError as e:
        if isinstance(e.reason, socket.timeout):
            return None, "timeout"
        return None, "network_error"
    except Exception:
        return None, "request_failed"


def sanitize_path(path):
    """Sanitize a filesystem path for use in API calls."""
    if not path:
        return "/BACKUP_V2"
    path = path.replace("\x00", "")
    if not path.startswith("/"):
        path = "/" + path
    if len(path) > 1:
        path = path.rstrip("/")
    return path


def format_size(size_bytes):
    """Format a byte count into a human-readable string (B, KB, MB, GB, TB)."""
    if size_bytes < 1024:
        return "{} B".format(int(size_bytes))
    elif size_bytes < 1024 ** 2:
        return "{:.1f} KB".format(size_bytes / 1024)
    elif size_bytes < 1024 ** 3:
        return "{:.1f} MB".format(size_bytes / 1024 ** 2)
    elif size_bytes < 1024 ** 4:
        return "{:.1f} GB".format(size_bytes / 1024 ** 3)
    else:
        return "{:.1f} TB".format(size_bytes / 1024 ** 4)


def sum_folder(metadata, depth=0):
    """Recursively sum total file size and file count within a folder dict.
    Returns (total_bytes, file_count).
    """
    if depth > 50:
        return 0, 0
    total_size = 0
    total_count = 0
    for item in metadata.get("contents", []):
        if item.get("isfolder"):
            sub_size, sub_count = sum_folder(item, depth + 1)
            total_size += sub_size
            total_count += sub_count
        else:
            total_size += item.get("size", 0)
            total_count += 1
    return total_size, total_count


def get_folder_data(host, token, hidden_folders_set):
    """Fetch top-level folder sizes via recursive listfolder.

    Returns (folders_list, total_all_files_bytes, error_str_or_None).
    folders_list is sorted descending by size.
    """
    data, error = api_request_safe(host, "listfolder?path=/&recursive=1", token)
    if data is None:
        return [], 0, error or "request_failed"

    if data.get("result") != 0:
        return [], 0, data.get("error", "api_error")

    root_metadata = data.get("metadata", {})
    contents = root_metadata.get("contents", [])

    folders = []
    total_all_files = 0
    root_file_size = 0
    root_file_count = 0

    for item in contents:
        if item.get("isfolder"):
            folder_name = item.get("name", "")
            size, count = sum_folder(item)
            total_all_files += size
            if folder_name in hidden_folders_set:
                continue
            folders.append({
                "name": folder_name,
                "size_bytes": size,
                "size_display": format_size(size),
                "file_count": count,
            })
        else:
            file_size = item.get("size", 0)
            root_file_size += file_size
            root_file_count += 1
            total_all_files += file_size

    if root_file_count > 0:
        folders.append({
            "name": "(root files)",
            "size_bytes": root_file_size,
            "size_display": format_size(root_file_size),
            "file_count": root_file_count,
        })

    folders.sort(key=lambda f: f["size_bytes"], reverse=True)
    return folders, total_all_files, None


def get_recent_activity(host, token):
    """Attempt to fetch recent file activity from the diff endpoint.

    Returns (activity_list, error_str_or_None).
    activity_list contains dicts with name, event, time keys.

    NOTE: pCloud 'diff' endpoint does not support OAuth2 tokens.
    Recent Activity feature requires password-based auth token.
    We attempt it anyway and degrade gracefully if unsupported.
    """
    data, error = api_request_safe(host, "diff?last=0&limit=20", token)
    if data is None:
        return None, error or "request_failed"

    if data.get("result") != 0:
        return None, data.get("error", "not_supported")

    entries = data.get("entries", [])
    activity = []
    for entry in entries[:20]:
        metadata = entry.get("metadata", {})
        name = metadata.get("name", "")
        if not name:
            name = entry.get("name", "")
        activity.append({
            "name": name,
            "event": entry.get("event", ""),
            "time": entry.get("time", 0),
        })

    return activity, None


def read_cache(max_age):
    """Return cached JSON data if fresh enough, otherwise None."""
    try:
        if not os.path.isfile(CACHE_FILE):
            return None
        age = time.time() - os.path.getmtime(CACHE_FILE)
        if age > max_age:
            return None
        with open(CACHE_FILE) as f:
            return json.load(f)
    except Exception:
        return None


def write_cache(data):
    """Write data to cache file. Failure is non-critical."""
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(data, f)
    except Exception:
        pass


def _parse_kopia_datetime(dt_str):
    """Parse a Kopia ISO 8601 datetime string to a UTC-aware datetime object."""
    if not dt_str:
        return None
    try:
        s = dt_str
        if s.endswith("Z"):
            s = s[:-1]
        if "." in s:
            s = s[:s.index(".")]
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def get_kopia_snapshots(container, labels, max_age_hours):
    """Fetch latest Kopia snapshot per source via Docker CLI.

    Returns a dict: {"available": True, "snapshots": [...]}
    or {"available": False, "error": "..."} on failure.
    Never raises — all errors are caught and returned as available=False.
    """
    try:
        proc = subprocess.run(
            ["docker", "exec", container, "kopia", "snapshot", "list", "--all", "--json"],
            capture_output=True, text=True, timeout=15,
        )
        if proc.returncode != 0:
            return {"available": False, "error": "kopia command failed"}

        snapshots = json.loads(proc.stdout)

        # Group by source path, keep latest startTime per path
        latest = {}
        for snap in snapshots:
            path = snap.get("source", {}).get("path", "")
            start = snap.get("startTime", "")
            if path not in latest or start > latest[path].get("startTime", ""):
                latest[path] = snap

        now = datetime.now(timezone.utc)
        result_snapshots = []

        for path, snap in latest.items():
            start_time_str = snap.get("startTime", "")
            end_time_str = snap.get("endTime") or ""

            # Determine status
            if not end_time_str:
                status = "in_progress"
                age_hours = 0.0
            else:
                start_dt = _parse_kopia_datetime(start_time_str)
                if start_dt is None:
                    status = "stale"
                    age_hours = 0.0
                else:
                    age_hours = (now - start_dt).total_seconds() / 3600.0
                    status = "ok" if age_hours < max_age_hours else "stale"

            # Size / file count from rootEntry.summ
            summ = snap.get("rootEntry", {}).get("summ", {})
            size_bytes = summ.get("size", 0)
            file_count = summ.get("files", 0)

            # Label: from config map, else last path segment
            label = labels.get(path, path.split("/")[-1] if path else path)

            # Normalise last_time to compact UTC string (no microseconds)
            start_dt_norm = _parse_kopia_datetime(start_time_str)
            if start_dt_norm:
                last_time = start_dt_norm.strftime("%Y-%m-%dT%H:%M:%SZ")
            else:
                last_time = start_time_str

            result_snapshots.append({
                "source": path,
                "label": label,
                "last_time": last_time,
                "age_hours": round(age_hours, 1),
                "size_bytes": size_bytes,
                "size_display": format_size(size_bytes),
                "file_count": file_count,
                "status": status,
            })

        # Sort most-recent first
        result_snapshots.sort(key=lambda s: s["last_time"], reverse=True)
        return {"available": True, "snapshots": result_snapshots}

    except FileNotFoundError:
        return {"available": False, "error": "docker not found"}
    except subprocess.TimeoutExpired:
        return {"available": False, "error": "timeout"}
    except Exception as e:
        return {"available": False, "error": str(e)}


def main():
    skip_folders = "--skip-folders" in sys.argv[1:]
    force_refresh = "--force-refresh" in sys.argv[1:]

    config = read_config()
    if config is None:
        output_error("no_token", (
            "No configuration file found. "
            "Create /etc/cockpit/pcloud.conf or ~/.config/cockpit/pcloud.conf "
            "with your pCloud access token. "
            "See docs/token-setup.md for instructions."
        ))

    token = config.get("pcloud", "token", fallback="").strip()
    if not token:
        output_error("no_token", (
            "No pCloud token configured. "
            "Add your access token to /etc/cockpit/pcloud.conf under [pcloud]. "
            "See docs/token-setup.md for instructions."
        ))

    # Validate token contains only safe characters (alphanumeric, dashes, underscores)
    if not re.match(r'^[A-Za-z0-9_-]+$', token):
        output_error("invalid_token", "Token contains invalid characters.")

    region = config.get("pcloud", "region", fallback="eu").strip().lower()
    if region not in API_HOSTS:
        region = "eu"
    host = API_HOSTS[region]

    backup_path = sanitize_path(
        config.get("pcloud", "backup_path", fallback="/BACKUP_V2")
    )

    # New config options (v2.0)
    hidden_folders_raw = config.get("pcloud", "hidden_folders", fallback="").strip()
    hidden_folders_set = set(
        f.strip() for f in hidden_folders_raw.split(",") if f.strip()
    ) if hidden_folders_raw else set()

    show_trash_str = config.get("pcloud", "show_trash", fallback="true").strip().lower()
    show_trash = show_trash_str != "false"

    # Kopia integration config (all optional)
    kopia_enabled_str = config.get("pcloud", "kopia_enabled", fallback="true").strip().lower()
    kopia_enabled = kopia_enabled_str != "false"

    kopia_container = config.get("pcloud", "kopia_container", fallback="kopia").strip() or "kopia"

    kopia_labels_raw = config.get("pcloud", "kopia_labels", fallback="").strip()
    kopia_labels = {}
    if kopia_labels_raw:
        for pair in kopia_labels_raw.split(","):
            pair = pair.strip()
            if "=" in pair:
                k, v = pair.split("=", 1)
                kopia_labels[k.strip()] = v.strip()

    try:
        kopia_max_age_hours = float(
            config.get("pcloud", "kopia_max_age_hours", fallback="25").strip()
        )
    except (ValueError, TypeError):
        kopia_max_age_hours = 25.0

    try:
        cache_seconds = int(
            config.get("pcloud", "cache_seconds", fallback=str(DEFAULT_CACHE_SECONDS)).strip()
        )
    except (ValueError, TypeError):
        cache_seconds = DEFAULT_CACHE_SECONDS

    # Serve from cache if fresh and not explicitly bypassed
    if not force_refresh and not skip_folders:
        cached = read_cache(cache_seconds)
        if cached is not None:
            cached["cached"] = True
            output_json(cached)  # exits here

    # Fetch user info (required — exits on failure)
    userinfo = api_request(host, "userinfo", token)

    if userinfo.get("result") != 0:
        output_error("api_error", userinfo.get("error", "Unknown API error"))

    quota_total = userinfo.get("quota", 0)
    quota_used = userinfo.get("usedquota", 0)
    quota_total_gb = round(quota_total / (1024 ** 3), 1)
    quota_used_gb = round(quota_used / (1024 ** 3), 1)
    quota_used_percent = round((quota_used / quota_total * 100), 1) if quota_total > 0 else 0

    premium = userinfo.get("premium", False)
    premium_expires = ""
    if premium and "premiumexpires" in userinfo:
        try:
            premium_expires = datetime.strptime(
                userinfo["premiumexpires"], "%a, %d %b %Y %H:%M:%S %z"
            ).strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            premium_expires = str(userinfo.get("premiumexpires", ""))

    # Check backup folder (use safe request to avoid aborting on 404)
    backup_folder_exists = False
    try:
        folder_url = "listfolder?path={}".format(urllib.parse.quote(backup_path, safe="/"))
        folder_data, _ = api_request_safe(host, folder_url, token)
        if folder_data and folder_data.get("result") == 0:
            backup_folder_exists = True
    except Exception:
        pass  # Graceful degradation

    # Fetch folder sizes (unless --skip-folders was passed)
    folders = []
    folders_error = None
    total_files_size = 0

    if not skip_folders:
        folders, total_files_size, folders_error = get_folder_data(
            host, token, hidden_folders_set
        )

    # Calculate trash size estimate
    trash_display = None
    trash_size_bytes = None
    if show_trash and not skip_folders and folders_error is None:
        diff = quota_used - total_files_size
        if diff >= 0:
            trash_size_bytes = diff
            if diff < 100 * 1024 * 1024:  # under 100 MB → negligible
                trash_display = "negligible"
            else:
                trash_display = "~" + format_size(diff)

    # Fetch recent activity
    recent_activity = None
    recent_activity_error = None
    activity_data, activity_error = get_recent_activity(host, token)
    if activity_data is not None:
        recent_activity = activity_data
    else:
        recent_activity_error = activity_error

    now = datetime.now(timezone.utc).astimezone()
    fetched_at = now.strftime("%Y-%m-%dT%H:%M:%S%z")
    # Insert colon in timezone offset for ISO 8601
    if len(fetched_at) >= 5 and fetched_at[-3] != ":":
        fetched_at = fetched_at[:-2] + ":" + fetched_at[-2:]

    result = {
        "status": "ok",
        "quota_total_gb": quota_total_gb,
        "quota_used_gb": quota_used_gb,
        "quota_used_percent": quota_used_percent,
        "quota_total_bytes": quota_total,
        "quota_used_bytes": quota_used,
        "email": userinfo.get("email", ""),
        "premium": premium,
        "premium_expires": premium_expires,
        "backup_folder_exists": backup_folder_exists,
        "backup_folder_path": backup_path,
        "fetched_at": fetched_at,
        "region": region,
        "folders": folders,
        "recent_activity": recent_activity,
        "recent_activity_error": recent_activity_error,
    }

    if folders_error:
        result["folders_error"] = folders_error

    if trash_display is not None:
        result["trash_display"] = trash_display
        result["trash_size_bytes"] = trash_size_bytes

    # Kopia snapshot status (optional, fully graceful)
    if kopia_enabled:
        result["kopia"] = get_kopia_snapshots(
            kopia_container, kopia_labels, kopia_max_age_hours
        )

    result["cached"] = False
    if not skip_folders:
        write_cache(result)
    output_json(result)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        output_error("internal_error", str(e))
