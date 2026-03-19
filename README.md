![License](https://img.shields.io/badge/license-MIT-blue)
![Cockpit](https://img.shields.io/badge/Cockpit-compatible-green)
![Python](https://img.shields.io/badge/python-3.6%2B-blue)
![Platform](https://img.shields.io/badge/platform-Ubuntu%20%7C%20Debian%20%7C%20Fedora%20%7C%20RHEL-lightgrey)
![pCloud](https://img.shields.io/badge/pCloud-EU%20%7C%20US-orange)

# cockpit-pcloud — pCloud Storage Monitor for Cockpit

A [Cockpit](https://cockpit-project.org/) plugin that displays your pCloud cloud storage status directly in the Cockpit web console. Monitor storage quota, account status, and backup folder health from your Linux server dashboard — no extra tools needed.

Built for the self-hosted and homelab community. Works with any pCloud account (EU or US region).

## Features

- **Storage quota overview** — visual progress bar showing used vs. total space with color-coded thresholds
- **Trash size estimate** — shows approximate trash usage below the quota bar
- **Account status** — displays email, Premium/Free badge, and subscription expiry date
- **Backup folder verification** — confirms your backup directory exists on pCloud
- **Kopia backup status** — shows latest snapshot time, size, and health for each backup source (requires Kopia running in Docker)
- **Folder Sizes card** — lists every top-level pCloud folder with size, file count, and a proportional progress bar
- **Recent Activity card** — latest file changes (create / modify / delete) with relative timestamps (requires diff API support)
- **Settings panel** — ⚙ gear icon opens a dropdown to show/hide any dashboard section; per-folder visibility toggles; all preferences saved in `localStorage`
- **EU and US region support** — works with both `eapi.pcloud.com` and `api.pcloud.com`
- **Secure token handling** — access token stored server-side with restricted file permissions, never exposed to the browser
- **Zero external dependencies** — uses only Python stdlib and vanilla JavaScript
- **One-command installation** — get up and running in under a minute

## Screenshot

![Screenshot](docs/screenshot.png)

## Requirements

- **Cockpit** 200+ (tested on Ubuntu 24.04 LTS default packages)
- **Python** 3.6 or newer
- **pCloud account** (EU or US) with an access token
- **Linux** — Ubuntu 22.04/24.04, Debian 12, Fedora 39/40, RHEL/AlmaLinux 9

## Quick Install

### Option A: Clone and install

```bash
git clone https://github.com/cgillinger/cockpit-pcloud.git
cd cockpit-pcloud
sudo bash install.sh
```

### Option B: Manual install

```bash
sudo mkdir -p /usr/share/cockpit/cockpit-pcloud
sudo cp src/* /usr/share/cockpit/cockpit-pcloud/
sudo chmod 755 /usr/share/cockpit/cockpit-pcloud/pcloud-backend.py
```

Then create the configuration file (see below).

## Configuration

Edit `/etc/cockpit/pcloud.conf`:

```ini
[pcloud]
token = YOUR_PCLOUD_ACCESS_TOKEN
region = eu
backup_path = /Backups          # change to your actual pCloud backup folder name
```

| Key               | Description                                               | Default       |
|-------------------|-----------------------------------------------------------|---------------|
| `token`           | pCloud OAuth2 access token (required)                     | *(empty)*     |
| `region`          | `eu` for European servers, `us` for US servers            | `eu`          |
| `backup_path`     | The pCloud folder path where your backups land. The plugin checks that this folder exists so you can confirm backups are arriving. Change it to match whatever folder your backup tool creates — e.g. `/Backups`, `/NAS-backup`, etc. | `/BACKUP_V2`  |
| `hidden_folders`  | Comma-separated folder names to exclude server-side       | *(empty)*     |
| `show_trash`      | Calculate and display trash estimate (`true`/`false`)     | `true`        |
| `cache_seconds`   | How long to cache backend responses in seconds            | `300`         |

Example with all options:

```ini
[pcloud]
token = YOUR_PCLOUD_ACCESS_TOKEN
region = eu
backup_path = /Backups          # the pCloud folder your backup tool writes to
# hidden_folders = OneDrive, Applications
# show_trash = true
# cache_seconds = 300
```

The configuration file is created automatically by `install.sh` with permissions `640` (readable only by root).

Per-user configuration is also supported at `~/.config/cockpit/pcloud.conf`.

## Kopia Integration (Optional)

If you run [Kopia](https://kopia.io/) as a Docker container for backups, cockpit-pcloud can display the status of your latest snapshots directly in the Backup Verification card.

### Requirements

- Kopia running as a Docker container (default name: `kopia`)
- The Cockpit user must have Docker access (typically via the `docker` group or superuser)

### Configuration

Add to `/etc/cockpit/pcloud.conf`:

```ini
[pcloud]
kopia_enabled = true
kopia_container = kopia
kopia_labels = /sources/nas-photos=photos, /sources/nas-documents=docs
kopia_max_age_hours = 25
```

| Key                  | Description                                                          | Default  |
|----------------------|----------------------------------------------------------------------|----------|
| `kopia_enabled`      | Enable Kopia snapshot status (`true`/`false`)                        | `true`   |
| `kopia_container`    | Docker container name for Kopia                                      | `kopia`  |
| `kopia_labels`       | Comma-separated `path=label` pairs for snapshot sources              | *(empty)*|
| `kopia_max_age_hours`| Hours before a snapshot is marked as stale                           | `25`     |

If `kopia_labels` is not set, source paths are used as labels automatically (last path segment).

### Without Kopia

If Kopia is not installed or `kopia_enabled = false`, the plugin works normally — the Backup Verification card simply shows whether the backup directory exists on pCloud.

> **Note:** The screenshot in this README predates the Kopia integration and should be updated.

## Getting a pCloud Token

See [docs/token-setup.md](docs/token-setup.md) for full instructions.

The recommended method is the OAuth2 authorization code flow: create an app at [pCloud My Apps](https://docs.pcloud.com/my_apps/), open the authorize URL with `response_type=code`, copy the code from the redirect URL, then exchange it for an access token via `curl`. Paste the resulting `access_token` into your config file.

## Security

- The pCloud access token is stored **only** on disk in `/etc/cockpit/pcloud.conf` with `chmod 640`
- The token is **never** sent to the browser, passed via URL parameters, or included in HTML
- The Python backend runs server-side via `cockpit.spawn()` — the token never leaves the server
- The token is **never** logged, even in debug mode
- All API communication uses HTTPS

## Updating

```bash
cd cockpit-pcloud
git pull
sudo bash install.sh
```

The installer is idempotent and will not overwrite your existing configuration.

## Uninstall

```bash
sudo bash uninstall.sh
```

This removes the plugin files but preserves your configuration. To fully remove:

```bash
sudo rm /etc/cockpit/pcloud.conf
```

## Compatibility

Tested on:

- Ubuntu 22.04 LTS, 24.04 LTS
- Debian 12 (Bookworm)
- Fedora 39, 40
- RHEL / AlmaLinux 9

Should work on any Linux distribution that runs Cockpit 200+ and Python 3.6+.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the [MIT License](LICENSE).

## Author

Christian Gillinger
