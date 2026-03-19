# Changelog

## [2.2.0] — 2026-03-19

### Fixed
- Storage quota progress bar not showing color in Cockpit (Cockpit's PatternFly CSS overrode plugin classes; switched to inline `backgroundColor` style)

### Added
- Server-side response caching (default 5 minutes, configurable via `cache_seconds` in `pcloud.conf`)
- Refresh button bypasses cache via `--force-refresh` flag
- `(cached)` indicator in footer when displaying cached data

---

## [2.1.0] — 2026-03-19

### Added
- Kopia backup snapshot status in Backup Verification card
- Shows latest snapshot time, size, file count, and health status per source
- Configurable labels, max age threshold, and container name via `pcloud.conf`
- Graceful degradation when Kopia is unavailable (docker not found, container not running, timeout)
- `kopia_enabled`, `kopia_container`, `kopia_labels`, `kopia_max_age_hours` config options
- "Kopia Snapshots" toggle in Settings panel

---

## [2.0.0] — 2026-03-19

### Added
- Folder Sizes card — shows size, file count, and quota proportion for each top-level pCloud folder
- Trash size estimate displayed in Storage Quota card (calculated as `usedquota − sum of all listed files`)
- Recent Activity card showing latest file changes (if pCloud diff API supports OAuth tokens)
- Settings panel (⚙ gear icon) with show/hide toggles for all dashboard sections
- Per-folder visibility toggles in Folder Sizes settings, persisted in `localStorage`
- `hidden_folders` config option in `pcloud.conf` for server-side folder filtering
- `show_trash` config option in `pcloud.conf` (default: `true`)
- `--skip-folders` CLI argument for backend — skips expensive recursive listing when Folder Sizes is hidden
- `quota_total_bytes` and `quota_used_bytes` fields in backend JSON output

### Fixed
- Backup folder check now uses `urllib.parse.quote` (stdlib) instead of the non-existent `urllib.request.quote`

---

## [1.0.1] — 2026-03-19

### Fixed
- Backup verification always failing due to malformed API URL (double `?` in query string)

### Improved
- Token setup documentation rewritten with authorization code flow as primary method
- Added troubleshooting section for common OAuth2 errors

---

## [1.0.0] — 2026-03-08

### Added
- Initial release
- Storage quota display with visual progress bar (color-coded thresholds)
- Account status display (email, Premium/Free badge, expiry date)
- Backup folder verification
- EU and US region support
- Secure token storage via `/etc/cockpit/pcloud.conf`
- Per-user configuration support via `~/.config/cockpit/pcloud.conf`
- One-command installation script
- Uninstall script
- Token setup documentation
