# How to Get a pCloud Access Token

This guide explains how to obtain an access token for the cockpit-pcloud plugin.

## Method 1: OAuth2 App (Recommended)

This is the safest method — your password is never exposed.

### Step 1: Create an App

1. Go to [https://docs.pcloud.com/my_apps/](https://docs.pcloud.com/my_apps/)
2. Log in with your pCloud account
3. Click **"Create New App"**
4. Fill in:
   - **App Name:** `cockpit-pcloud` (or any name you like)
   - **Redirect URI:** `http://localhost`
5. Note the **Client ID** shown after creation

### Step 2: Authorize the App

Open this URL in your browser, replacing `YOUR_CLIENT_ID`:

**For EU accounts:**
```
https://e.pcloud.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&response_type=token&redirect_uri=http://localhost
```

**For US accounts:**
```
https://my.pcloud.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&response_type=token&redirect_uri=http://localhost
```

### Step 3: Get the Token

1. After authorizing, you will be redirected to `http://localhost#access_token=XXXXXXX&...`
2. The page may not load — that's expected
3. Copy the `access_token` value from the URL bar
4. The token is the string between `access_token=` and the next `&`

### Step 4: Configure the Plugin

```bash
sudo nano /etc/cockpit/pcloud.conf
```

```ini
[pcloud]
token = YOUR_TOKEN_HERE
region = eu
backup_path = /BACKUP_V2
```

Save and reload the pCloud page in Cockpit.

---

## Method 2: Direct Auth Token

> **Warning:** This method sends your password in the URL. Use Method 1 if possible.

Run this command (replace `EMAIL` and `PASSWORD`):

**For EU accounts:**
```bash
curl -s "https://eapi.pcloud.com/userinfo?getauth=1&logout=1&username=EMAIL&password=PASSWORD" | python3 -m json.tool
```

**For US accounts:**
```bash
curl -s "https://api.pcloud.com/userinfo?getauth=1&logout=1&username=EMAIL&password=PASSWORD" | python3 -m json.tool
```

Copy the `auth` value from the JSON response and add it to your config file as the `token` value.

---

## EU vs. US: Which Region Am I On?

- **EU accounts** use `eapi.pcloud.com` → set `region = eu`
- **US accounts** use `api.pcloud.com` → set `region = us`

If you're not sure which region your account uses:

1. Try EU first (`region = eu`)
2. If you get an error like `"2000: Log in required"`, switch to `region = us`

Your region was determined when you created your pCloud account. EU accounts are stored in Luxembourg, US accounts in Texas.

---

## Token Security

- Store the token only in `/etc/cockpit/pcloud.conf`
- Set file permissions: `sudo chmod 640 /etc/cockpit/pcloud.conf`
- Never share your token or commit it to version control
- If compromised, revoke the token at [pCloud My Apps](https://docs.pcloud.com/my_apps/) and generate a new one
