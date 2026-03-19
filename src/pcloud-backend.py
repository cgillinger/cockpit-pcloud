#!/usr/bin/env python3
"""
pcloud-backend.py — Backend script for cockpit-pcloud plugin.
Reads pCloud token from config, queries pCloud API, returns JSON to stdout.
"""

import configparser
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone


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
    """Make a GET request to the pCloud API."""
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


def sanitize_path(path):
    """Sanitize a filesystem path for use in API calls."""
    # Remove any null bytes and normalize
    if not path:
        return "/BACKUP_V2"
    path = path.replace("\x00", "")
    # Ensure path starts with /
    if not path.startswith("/"):
        path = "/" + path
    # Remove trailing slashes (except root)
    if len(path) > 1:
        path = path.rstrip("/")
    return path


def main():
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

    # Fetch user info
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

    # Check backup folder
    backup_folder_exists = False
    try:
        folder_url = "listfolder?path={}".format(urllib.request.quote(backup_path, safe="/"))
        folder_data = api_request(host, folder_url, token)
        if folder_data.get("result") == 0:
            backup_folder_exists = True
    except Exception:
        pass  # Graceful degradation

    now = datetime.now(timezone.utc).astimezone()
    fetched_at = now.strftime("%Y-%m-%dT%H:%M:%S%z")
    # Insert colon in timezone offset for ISO 8601
    if len(fetched_at) >= 5 and fetched_at[-3] != ":":
        fetched_at = fetched_at[:-2] + ":" + fetched_at[-2:]

    output_json({
        "status": "ok",
        "quota_total_gb": quota_total_gb,
        "quota_used_gb": quota_used_gb,
        "quota_used_percent": quota_used_percent,
        "email": userinfo.get("email", ""),
        "premium": premium,
        "premium_expires": premium_expires,
        "backup_folder_exists": backup_folder_exists,
        "backup_folder_path": backup_path,
        "fetched_at": fetched_at,
        "region": region,
    })


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        output_error("internal_error", str(e))
