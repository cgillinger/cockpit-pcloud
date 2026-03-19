# How to Get a pCloud Access Token

This guide explains how to obtain an access token for the cockpit-pcloud plugin.

## Method 1: OAuth2 Authorization Code Flow (Recommended)

This is the safest method — your password is never exposed, and it works with all pCloud apps by default.

### Step 1: Create an App

1. Go to [https://docs.pcloud.com/my_apps/](https://docs.pcloud.com/my_apps/)
2. Log in with your pCloud account
3. Click **"Create New App"**
4. Fill in:
   - **App Name:** `cockpit-pcloud` (or any name you like)
   - **Redirect URI:** `http://localhost`
5. Note the **Client ID** and **Client Secret** shown after creation

### Step 2: Authorize the App

Open this URL in your browser, replacing `YOUR_CLIENT_ID`:

**For EU accounts:**
```
https://e.pcloud.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost
```

**For US accounts:**
```
https://my.pcloud.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost
```

### Step 3: Get the Code

1. After authorizing, your browser will be redirected to `http://localhost?code=XXXXXXX`
2. The page will not load — that's expected
3. Copy the `code` value from the URL bar

### Step 4: Exchange the Code for a Token

Run this command, replacing `YOUR_CLIENT_ID`, `YOUR_CLIENT_SECRET`, and `THE_CODE`:

```bash
curl -s "https://eapi.pcloud.com/oauth2_token?client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&code=THE_CODE" | python3 -m json.tool
```

For US accounts, use `https://api.pcloud.com/oauth2_token` instead.

Copy the `access_token` value from the JSON response.

### Step 5: Configure the Plugin

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

## Method 2: OAuth2 Implicit Grant (Alternative)

> **Note:** This method requires that "Allow implicit grant" is set to **Allow** in your app settings at [docs.pcloud.com/my_apps/](https://docs.pcloud.com/my_apps/). It also requires a Redirect URI (e.g. `http://localhost`) to be configured. Use Method 1 if you haven't changed these settings.

### Step 1: Create an App

Follow the same Step 1 as Method 1, then:
- In your app settings, set **Allow implicit grant** to **Allow**
- Ensure **Redirect URI** is set to `http://localhost`

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

Follow the same Step 5 as Method 1.

---

## Method 3: Direct Auth Token

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

---

## Common Issues

**"This application only supports 'code' 'response_type'"**
Your app does not have implicit grant enabled. Use Method 1 (authorization code flow) instead — it works without any extra app configuration.

**"This 'redirect_uri' is not authorized"**
The Redirect URI is missing from your app settings. Go to [docs.pcloud.com/my_apps/](https://docs.pcloud.com/my_apps/), open your app, and add `http://localhost` as a Redirect URI.

**The page doesn't load after authorizing**
That's expected. The redirect to `http://localhost` will fail to load in your browser, but the token or code is visible in the URL bar. Copy it from there.
