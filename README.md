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
- **Account status** — displays email, Premium/Free badge, and subscription expiry date
- **Backup folder verification** — confirms your backup directory exists on pCloud
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
backup_path = /BACKUP_V2
```

| Key           | Description                                      | Default       |
|---------------|--------------------------------------------------|---------------|
| `token`       | pCloud OAuth2 access token (required)            | *(empty)*     |
| `region`      | `eu` for European servers, `us` for US servers   | `eu`          |
| `backup_path` | Path on pCloud to verify exists                  | `/BACKUP_V2`  |

The configuration file is created automatically by `install.sh` with permissions `640` (readable only by root).

Per-user configuration is also supported at `~/.config/cockpit/pcloud.conf`.

## Getting a pCloud Token

See [docs/token-setup.md](docs/token-setup.md) for a step-by-step guide.

In short: create an app at [pCloud My Apps](https://docs.pcloud.com/my_apps/), authorize it via the OAuth2 flow, and paste the resulting token into your config file.

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
