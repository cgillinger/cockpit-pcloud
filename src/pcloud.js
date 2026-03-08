(function() {
    "use strict";

    var BACKEND_PATH = "/usr/share/cockpit/cockpit-pcloud/pcloud-backend.py";

    function show(el) {
        el.style.display = "";
    }

    function hide(el) {
        el.style.display = "none";
    }

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

    function escapeHtml(text) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    function renderDashboard(data) {
        hide(document.getElementById("loading-state"));
        hide(document.getElementById("error-state"));
        show(document.getElementById("dashboard"));

        // Region badge
        var regionBadge = document.getElementById("region-badge");
        regionBadge.textContent = data.region.toUpperCase();
        show(regionBadge);

        // Quota
        var percent = data.quota_used_percent;
        var quotaBar = document.getElementById("quota-bar");
        quotaBar.style.width = percent + "%";
        quotaBar.setAttribute("aria-valuenow", percent);

        // Remove old color classes
        quotaBar.classList.remove("progress-bar-success", "progress-bar-warning", "progress-bar-danger");
        if (percent > 85) {
            quotaBar.classList.add("progress-bar-danger");
        } else if (percent > 60) {
            quotaBar.classList.add("progress-bar-warning");
        } else {
            quotaBar.classList.add("progress-bar-success");
        }

        // Format quota display
        var totalDisplay = data.quota_total_gb >= 1024
            ? (data.quota_total_gb / 1024).toFixed(1) + " TB"
            : data.quota_total_gb + " GB";
        document.getElementById("quota-text").textContent =
            data.quota_used_gb.toFixed(1) + " GB / " + totalDisplay + " used (" + percent + "%)";

        // Account
        document.getElementById("account-email").textContent = data.email;

        var planEl = document.getElementById("account-plan");
        if (data.premium) {
            planEl.innerHTML = '<span class="badge badge-success pcloud-badge-premium">Premium</span>';
        } else {
            planEl.innerHTML = '<span class="badge badge-default pcloud-badge-free">Free</span>';
        }

        var expiryRow = document.getElementById("premium-expiry-row");
        if (data.premium && data.premium_expires) {
            document.getElementById("account-expiry").textContent = data.premium_expires;
            show(expiryRow);
        } else {
            hide(expiryRow);
        }

        // Backup
        var backupStatus = document.getElementById("backup-status");
        if (data.backup_folder_exists) {
            backupStatus.innerHTML =
                '<span class="pcloud-status-ok">&#10003; Backup directory found</span>';
        } else {
            backupStatus.innerHTML =
                '<span class="pcloud-status-fail">&#10007; Backup directory not found</span>';
        }
        document.getElementById("backup-path").textContent = "Path: " + data.backup_folder_path;

        // Metadata
        var fetchedAt = data.fetched_at;
        try {
            var d = new Date(fetchedAt);
            fetchedAt = d.toLocaleTimeString();
        } catch (e) {
            // keep original string
        }
        document.getElementById("fetched-at").textContent = "Last updated: " + fetchedAt;
    }

    function fetchPCloudStatus() {
        showLoadingState();

        cockpit.spawn(["python3", BACKEND_PATH], { superuser: "try" })
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

    document.addEventListener("DOMContentLoaded", function() {
        fetchPCloudStatus();
        document.getElementById("refresh-btn").addEventListener("click", fetchPCloudStatus);
    });
})();
