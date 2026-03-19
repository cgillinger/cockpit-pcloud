(function() {
    "use strict";

    var BACKEND_PATH = "/usr/share/cockpit/cockpit-pcloud/pcloud-backend.py";
    var LS_SECTIONS = "cockpit-pcloud-visible-sections";
    var LS_HIDDEN_FOLDERS = "cockpit-pcloud-hidden-folders";

    var SECTION_DEFS = [
        { key: "storage-quota",       label: "Storage Quota" },
        { key: "account-status",      label: "Account Status" },
        { key: "backup-verification", label: "Backup Verification" },
        { key: "folder-sizes",        label: "Folder Sizes" },
        { key: "trash-size",          label: "Trash Size" },
        { key: "recent-activity",     label: "Recent Activity" },
        { key: "kopia-snapshots",     label: "Kopia Snapshots" },
    ];

    // Module-level state
    var lastData = null;
    var settingsOpen = false;

    // --- DOM helpers ---

    function show(el) { if (el) el.style.display = ""; }
    function hide(el) { if (el) el.style.display = "none"; }

    function escapeHtml(text) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(String(text)));
        return div.innerHTML;
    }

    // --- localStorage helpers ---

    function loadVisibleSections() {
        var defaults = {};
        SECTION_DEFS.forEach(function(s) { defaults[s.key] = true; });
        try {
            var stored = localStorage.getItem(LS_SECTIONS);
            if (stored) {
                var parsed = JSON.parse(stored);
                var result = {};
                SECTION_DEFS.forEach(function(s) {
                    result[s.key] = (s.key in parsed) ? !!parsed[s.key] : true;
                });
                return result;
            }
        } catch (e) {}
        return defaults;
    }

    function saveVisibleSections(sections) {
        try { localStorage.setItem(LS_SECTIONS, JSON.stringify(sections)); } catch (e) {}
    }

    function loadHiddenFolders() {
        try {
            var stored = localStorage.getItem(LS_HIDDEN_FOLDERS);
            if (stored) return JSON.parse(stored);
        } catch (e) {}
        return [];
    }

    function saveHiddenFolders(folders) {
        try { localStorage.setItem(LS_HIDDEN_FOLDERS, JSON.stringify(folders)); } catch (e) {}
    }

    // --- Visibility ---

    function applyVisibility() {
        if (!lastData) return;
        var sections = loadVisibleSections();

        // Static cards (always have content when dashboard is shown)
        var staticMap = {
            "storage-quota":       "card-storage-quota",
            "account-status":      "card-account-status",
            "backup-verification": "card-backup-verification",
        };
        Object.keys(staticMap).forEach(function(key) {
            var el = document.getElementById(staticMap[key]);
            if (el) el.style.display = sections[key] ? "" : "none";
        });

        // Trash line within quota card
        var trashEl = document.getElementById("trash-text");
        if (trashEl) {
            trashEl.style.display = (sections["trash-size"] && lastData.trash_display) ? "" : "none";
        }

        // Folder sizes — only show if enabled AND folder data exists
        var folderCard = document.getElementById("card-folder-sizes");
        if (folderCard) {
            var hasFolders = lastData.folders && lastData.folders.length > 0;
            folderCard.style.display = (sections["folder-sizes"] && hasFolders) ? "" : "none";
        }

        // Recent activity — only show if enabled AND activity data exists
        var actCard = document.getElementById("card-recent-activity");
        if (actCard) {
            var hasActivity = lastData.recent_activity && lastData.recent_activity.length > 0;
            actCard.style.display = (sections["recent-activity"] && hasActivity) ? "" : "none";
        }

        // Kopia snapshots — within the backup verification card
        var kopiaSection = document.getElementById("kopia-snapshots-section");
        if (kopiaSection) {
            var kopiaAvailable = lastData.kopia && lastData.kopia.available &&
                lastData.kopia.snapshots && lastData.kopia.snapshots.length > 0;
            kopiaSection.style.display = (sections["kopia-snapshots"] && kopiaAvailable) ? "" : "none";
        }
    }

    // --- Relative time formatting ---

    function formatRelativeTime(unixTimestamp) {
        var now = Math.floor(Date.now() / 1000);
        var diff = now - unixTimestamp;
        if (diff < 60) return "just now";
        if (diff < 3600) return Math.floor(diff / 60) + " minutes ago";
        if (diff < 86400) return Math.floor(diff / 3600) + " hours ago";
        if (diff < 172800) return "yesterday";
        return Math.floor(diff / 86400) + " days ago";
    }

    // --- Folder rows rendering ---

    function renderFolderRows() {
        if (!lastData || !lastData.folders) return;
        var folders = lastData.folders;
        var hiddenFolders = loadHiddenFolders();
        var container = document.getElementById("folder-sizes-content");
        if (!container) return;

        var visible = folders.filter(function(f) {
            return hiddenFolders.indexOf(f.name) === -1;
        });

        if (visible.length === 0) {
            container.innerHTML = '<p class="pcloud-no-data">No folders to display.</p>';
            return;
        }

        // Use quota bytes as denominator so bar shows proportion of total quota
        var totalBytes = (lastData.quota_used_bytes && lastData.quota_used_bytes > 0)
            ? lastData.quota_used_bytes : 1;

        var html = '<table class="pcloud-folder-table">';
        html += '<thead><tr>';
        html += '<th class="pcloud-th-name">Folder</th>';
        html += '<th class="pcloud-th-size">Size</th>';
        html += '<th class="pcloud-th-files">Files</th>';
        html += '</tr></thead><tbody>';

        visible.forEach(function(folder, idx) {
            var pct = Math.min(100, (folder.size_bytes / totalBytes * 100));
            var rowCls = (idx % 2 === 1) ? " pcloud-row-alt" : "";
            html += '<tr class="pcloud-folder-row' + rowCls + '">';
            html += '<td class="pcloud-td-name">';
            html += '<div class="pcloud-folder-name">' + escapeHtml(folder.name) + '</div>';
            html += '<div class="pcloud-bar-wrap">';
            html += '<div class="pcloud-bar-fill" style="width:' + pct.toFixed(1) + '%"></div>';
            html += '</div></td>';
            html += '<td class="pcloud-td-size">' + escapeHtml(folder.size_display) + '</td>';
            html += '<td class="pcloud-td-files">' + escapeHtml(String(folder.file_count)) + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    // --- Settings panel ---

    function buildSettingsPanel() {
        var sections = loadVisibleSections();
        var hiddenFolders = loadHiddenFolders();
        var container = document.getElementById("settings-checkboxes");
        if (!container) return;

        container.innerHTML = "";

        SECTION_DEFS.forEach(function(sectionDef) {
            var key = sectionDef.key;
            var checked = sections[key];

            var row = document.createElement("label");
            row.className = "pcloud-settings-row";

            var cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "pcloud-settings-cb";
            cb.checked = checked;
            cb.addEventListener("change", function() {
                var s = loadVisibleSections();
                s[key] = cb.checked;
                saveVisibleSections(s);
                applyVisibility();
                if (key === "folder-sizes") {
                    var folderList = document.getElementById("settings-folder-list");
                    if (folderList) folderList.style.display = cb.checked ? "" : "none";
                }
            });

            row.appendChild(cb);
            row.appendChild(document.createTextNode("\u00a0" + sectionDef.label));
            container.appendChild(row);

            // Per-folder checkboxes nested under Folder Sizes
            if (key === "folder-sizes") {
                var folderSubList = document.createElement("div");
                folderSubList.id = "settings-folder-list";
                folderSubList.className = "pcloud-settings-folder-list";
                folderSubList.style.display = checked ? "" : "none";

                if (lastData && lastData.folders && lastData.folders.length > 0) {
                    lastData.folders.forEach(function(folder) {
                        var isHidden = hiddenFolders.indexOf(folder.name) !== -1;
                        var fRow = document.createElement("label");
                        fRow.className = "pcloud-settings-row pcloud-settings-folder-row";

                        var fCb = document.createElement("input");
                        fCb.type = "checkbox";
                        fCb.className = "pcloud-settings-cb";
                        fCb.checked = !isHidden;

                        fCb.addEventListener("change", (function(fname) {
                            return function() {
                                var hidden = loadHiddenFolders();
                                if (fCb.checked) {
                                    hidden = hidden.filter(function(f) { return f !== fname; });
                                } else {
                                    if (hidden.indexOf(fname) === -1) hidden.push(fname);
                                }
                                saveHiddenFolders(hidden);
                                renderFolderRows();
                            };
                        })(folder.name));

                        fRow.appendChild(fCb);
                        var label = "\u00a0" + folder.name;
                        if (folder.size_display) label += " \u2014 " + folder.size_display;
                        fRow.appendChild(document.createTextNode(label));
                        folderSubList.appendChild(fRow);
                    });
                } else {
                    var noData = document.createElement("p");
                    noData.className = "pcloud-settings-no-data";
                    noData.textContent = "No folder data available.";
                    folderSubList.appendChild(noData);
                }
                container.appendChild(folderSubList);
            }
        });
    }

    // --- Kopia snapshot rendering ---

    function renderKopiaSnapshots(data) {
        var section = document.getElementById("kopia-snapshots-section");
        var content = document.getElementById("kopia-snapshots-content");
        if (!section || !content) return;

        var kopia = data.kopia;
        if (!kopia || !kopia.available || !kopia.snapshots || kopia.snapshots.length === 0) {
            hide(section);
            return;
        }

        var html = '<table class="kopia-snapshot-table"><tbody>';

        kopia.snapshots.forEach(function(snap, idx) {
            var rowCls = (idx % 2 === 1) ? " pcloud-row-alt" : "";

            // Format datetime as MM-DD HH:MM (UTC)
            var timeStr = snap.last_time || "";
            try {
                var dt = new Date(snap.last_time);
                if (!isNaN(dt.getTime())) {
                    var mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
                    var dy = String(dt.getUTCDate()).padStart(2, "0");
                    var hr = String(dt.getUTCHours()).padStart(2, "0");
                    var mn = String(dt.getUTCMinutes()).padStart(2, "0");
                    timeStr = mo + "-" + dy + " " + hr + ":" + mn;
                }
            } catch (e) {}

            var statusIcon, statusCls;
            if (snap.status === "ok") {
                statusIcon = "&#10003;"; statusCls = "kopia-status-ok";
            } else if (snap.status === "stale") {
                statusIcon = "&#10007;"; statusCls = "kopia-status-stale";
            } else {
                statusIcon = "&#9203;"; statusCls = "kopia-status-progress";
            }

            html += '<tr class="kopia-snapshot-row' + rowCls + '">';
            html += '<td class="kopia-td-label">' + escapeHtml(snap.label) + '</td>';
            html += '<td class="kopia-td-time">' + escapeHtml(timeStr) + '</td>';
            html += '<td class="kopia-td-status"><span class="' + statusCls + '">' + statusIcon + '</span></td>';
            html += '<td class="kopia-td-size">' + escapeHtml(snap.size_display) + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        content.innerHTML = html;
        show(section);
    }

    // --- Loading / Error states ---

    function showLoadingState() {
        show(document.getElementById("loading-state"));
        hide(document.getElementById("error-state"));
        hide(document.getElementById("dashboard"));
        hide(document.getElementById("region-badge"));
    }

    function renderError(data) {
        hide(document.getElementById("loading-state"));
        hide(document.getElementById("dashboard"));
        var errorEl = document.getElementById("error-state");
        show(errorEl);

        if (data && data.error === "no_token") {
            errorEl.innerHTML =
                '<div class="card-pf pcloud-card pcloud-error-card">' +
                '  <div class="card-pf-heading">' +
                '    <h3 class="card-pf-title">Configuration Required</h3>' +
                '  </div>' +
                '  <div class="card-pf-body">' +
                '    <p class="pcloud-error-message">' + escapeHtml(data.message) + '</p>' +
                '    <div class="pcloud-setup-guide">' +
                '      <h4>Quick Setup</h4>' +
                '      <ol>' +
                '        <li>Create or edit the configuration file:<br>' +
                '          <code>sudo nano /etc/cockpit/pcloud.conf</code></li>' +
                '        <li>Add the following content:<br>' +
                '          <pre>[pcloud]\ntoken = YOUR_ACCESS_TOKEN\nregion = eu</pre></li>' +
                '        <li>Set proper permissions:<br>' +
                '          <code>sudo chmod 640 /etc/cockpit/pcloud.conf</code></li>' +
                '        <li>Click <strong>Refresh</strong> above</li>' +
                '      </ol>' +
                '      <p>See <code>docs/token-setup.md</code> for how to obtain a pCloud access token.</p>' +
                '    </div>' +
                '  </div>' +
                '</div>';
        } else {
            var message = "An unexpected error occurred.";
            if (data && data.message) {
                message = data.message;
            } else if (typeof data === "string") {
                message = data;
            }
            errorEl.innerHTML =
                '<div class="card-pf pcloud-card pcloud-error-card">' +
                '  <div class="card-pf-heading">' +
                '    <h3 class="card-pf-title">Error</h3>' +
                '  </div>' +
                '  <div class="card-pf-body">' +
                '    <p class="pcloud-error-message">' + escapeHtml(message) + '</p>' +
                '    <p>Click <strong>Refresh</strong> to try again.</p>' +
                '  </div>' +
                '</div>';
        }
    }

    // --- Main dashboard render ---

    function renderDashboard(data) {
        lastData = data;

        hide(document.getElementById("loading-state"));
        hide(document.getElementById("error-state"));
        show(document.getElementById("dashboard"));

        // Region badge
        var regionBadge = document.getElementById("region-badge");
        if (regionBadge) {
            regionBadge.textContent = data.region.toUpperCase();
            show(regionBadge);
        }

        // Storage quota bar
        var percent = data.quota_used_percent;
        var quotaBar = document.getElementById("quota-bar");
        if (quotaBar) {
            quotaBar.style.width = percent + "%";
            quotaBar.setAttribute("aria-valuenow", percent);
            quotaBar.classList.remove("progress-bar-success", "progress-bar-warning", "progress-bar-danger");
            if (percent > 85) {
                quotaBar.classList.add("progress-bar-danger");
            } else if (percent > 60) {
                quotaBar.classList.add("progress-bar-warning");
            } else {
                quotaBar.classList.add("progress-bar-success");
            }
        }

        var totalDisplay = data.quota_total_gb >= 1024
            ? (data.quota_total_gb / 1024).toFixed(1) + " TB"
            : data.quota_total_gb + " GB";
        var quotaTextEl = document.getElementById("quota-text");
        if (quotaTextEl) {
            quotaTextEl.textContent =
                data.quota_used_gb.toFixed(1) + " GB / " + totalDisplay + " used (" + percent + "%)";
        }

        // Trash size estimate
        var trashEl = document.getElementById("trash-text");
        if (trashEl) {
            if (data.trash_display) {
                trashEl.textContent = "Trash: " + data.trash_display;
            } else {
                hide(trashEl);
            }
        }

        // Account status
        var emailEl = document.getElementById("account-email");
        if (emailEl) emailEl.textContent = data.email;

        var planEl = document.getElementById("account-plan");
        if (planEl) {
            planEl.innerHTML = data.premium
                ? '<span class="badge badge-success pcloud-badge-premium">Premium</span>'
                : '<span class="badge badge-default pcloud-badge-free">Free</span>';
        }

        var expiryRow = document.getElementById("premium-expiry-row");
        if (expiryRow) {
            if (data.premium && data.premium_expires) {
                var expiryEl = document.getElementById("account-expiry");
                if (expiryEl) expiryEl.textContent = data.premium_expires;
                show(expiryRow);
            } else {
                hide(expiryRow);
            }
        }

        // Backup verification
        var backupStatus = document.getElementById("backup-status");
        if (backupStatus) {
            backupStatus.innerHTML = data.backup_folder_exists
                ? '<span class="pcloud-status-ok">&#10003; Backup directory found</span>'
                : '<span class="pcloud-status-fail">&#10007; Backup directory not found</span>';
        }
        var backupPathEl = document.getElementById("backup-path");
        if (backupPathEl) backupPathEl.textContent = "Path: " + data.backup_folder_path;

        // Folder sizes content
        if (data.folders_error && (!data.folders || data.folders.length === 0)) {
            var fsContent = document.getElementById("folder-sizes-content");
            if (fsContent) {
                fsContent.innerHTML =
                    '<p class="pcloud-no-data">Folder data unavailable: ' +
                    escapeHtml(data.folders_error) + '</p>';
            }
        } else {
            renderFolderRows();
        }

        // Recent activity
        var actContent = document.getElementById("recent-activity-content");
        if (actContent && data.recent_activity && data.recent_activity.length > 0) {
            var html = '<ul class="pcloud-activity-list">';
            data.recent_activity.forEach(function(entry) {
                var icon, iconCls;
                if (entry.event === "delete") {
                    icon = "&#10007;"; iconCls = "pcloud-act-delete";
                } else if (entry.event === "create") {
                    icon = "+"; iconCls = "pcloud-act-create";
                } else {
                    icon = "&#8635;"; iconCls = "pcloud-act-modify";
                }
                var name = (entry.name && entry.name.length > 40)
                    ? entry.name.substring(0, 37) + "\u2026"
                    : (entry.name || "(unnamed)");
                var timeStr = entry.time ? formatRelativeTime(entry.time) : "";
                html += '<li class="pcloud-activity-item">';
                html += '<span class="pcloud-act-icon ' + iconCls + '">' + icon + '</span>';
                html += '<span class="pcloud-act-name">' + escapeHtml(name) + '</span>';
                if (timeStr) {
                    html += '<span class="pcloud-act-time">' + escapeHtml(timeStr) + '</span>';
                }
                html += '</li>';
            });
            html += '</ul>';
            actContent.innerHTML = html;
        }

        // Kopia snapshots
        renderKopiaSnapshots(data);

        // Rebuild settings panel now that folder data is available
        buildSettingsPanel();

        // Apply all visibility rules
        applyVisibility();

        // Metadata footer
        var fetchedAt = data.fetched_at;
        try { fetchedAt = new Date(fetchedAt).toLocaleTimeString(); } catch (e) {}
        var fetchedAtEl = document.getElementById("fetched-at");
        if (fetchedAtEl) fetchedAtEl.textContent = "Last updated: " + fetchedAt;
    }

    // --- Data fetch ---

    function fetchPCloudStatus() {
        showLoadingState();

        var sections = loadVisibleSections();
        var args = ["python3", BACKEND_PATH];
        if (!sections["folder-sizes"]) {
            args.push("--skip-folders");
        }

        cockpit.spawn(args, { superuser: "try" })
            .then(function(output) {
                var data;
                try {
                    data = JSON.parse(output);
                } catch (e) {
                    renderError("Failed to parse backend response.");
                    return;
                }
                if (data.status === "error") {
                    renderError(data);
                } else {
                    renderDashboard(data);
                }
            })
            .catch(function(err) {
                renderError(err.message || "Failed to run backend script.");
            });
    }

    // --- Initialisation ---

    document.addEventListener("DOMContentLoaded", function() {
        // Build settings panel with saved preferences (no folder data yet)
        buildSettingsPanel();

        // Settings gear button toggle
        var settingsBtn = document.getElementById("settings-btn");
        var settingsPanel = document.getElementById("settings-panel");

        if (settingsBtn && settingsPanel) {
            settingsBtn.addEventListener("click", function(e) {
                e.stopPropagation();
                settingsOpen = !settingsOpen;
                settingsPanel.style.display = settingsOpen ? "" : "none";
            });

            // Close panel when clicking outside
            document.addEventListener("click", function(e) {
                if (settingsOpen &&
                    !settingsPanel.contains(e.target) &&
                    e.target !== settingsBtn) {
                    settingsOpen = false;
                    settingsPanel.style.display = "none";
                }
            });
        }

        fetchPCloudStatus();
        document.getElementById("refresh-btn").addEventListener("click", fetchPCloudStatus);
    });
})();
