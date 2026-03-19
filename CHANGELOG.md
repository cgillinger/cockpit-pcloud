# Changelog

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
