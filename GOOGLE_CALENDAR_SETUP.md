# Google Calendar Integration Setup Guide

## Problem: "Access blocked: This app's request is invalid"

This error occurs when the OAuth configuration doesn't match Google's requirements. Here are two methods to fix it:

## Method 1: Create Your Own OAuth Client (Recommended)

### Step 1: Set up Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google Calendar API:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

### Step 2: Create OAuth 2.0 Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Configure the consent screen first if prompted:
   - User Type: External
   - Add your app name and support email
   - Add authorized domain: `townranker.com`
   - Add test users (your Gmail accounts)
4. For the OAuth client:
   - Application type: Web application
   - Name: "TownRanker Calendar Sync"
   - Authorized JavaScript origins:
     ```
     https://townranker.com
     http://5.78.81.114:3001
     http://localhost:3001
     ```
   - Authorized redirect URIs:
     ```
     https://townranker.com/api/calendar/oauth2callback
     http://5.78.81.114:3001/api/calendar/oauth2callback
     http://localhost:3001/api/calendar/oauth2callback
     ```
5. Download the credentials JSON

### Step 3: Update Configuration
Pick whichever option you prefer. The server will look for environment variables first and then fall back to the credentials file.

**Option A — .env file**
1. Extract the client ID and secret from the downloaded JSON
2. Update `/var/www/townranker.com/.env`:
   ```
   GOOGLE_CLIENT_ID=your-new-client-id
   GOOGLE_CLIENT_SECRET=your-new-client-secret
   GOOGLE_API_KEY=your-browser-api-key
   # Optional: override the callback that gets auto-detected
   GOOGLE_REDIRECT_URI=https://townranker.com/api/calendar/oauth2callback
   ```
3. If you need to support multiple hosts (local dev, IP, domain), you can also set `GOOGLE_REDIRECT_URIS` with a comma-separated list.

**Option B — Credentials file**
1. Copy the OAuth JSON you downloaded into the server:
   ```
   /var/www/townranker.com/.credentials/google-credentials.json
   ```
2. Secure it: `chmod 600 /var/www/townranker.com/.credentials/google-credentials.json`
3. Restart the app so the new file is loaded. No `.env` changes are required when the file is present.

### Step 4: Authenticate
1. Restart the server: `pm2 restart townranker-production`
2. Visit: http://5.78.81.114:3001/api/calendar/auth
3. Sign in with Google and grant permissions

## Method 2: Service Account (No User Consent Needed)

### Step 1: Create Service Account
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Go to "IAM & Admin" → "Service Accounts"
3. Click "Create Service Account"
4. Name: "TownRanker Calendar Service"
5. Grant role: "Project" → "Editor" (or just Calendar API access)
6. Create and download JSON key

### Step 2: Set Up Service Account
1. Save the JSON key to:
   ```
   /var/www/townranker.com/.credentials/service-account-key.json
   ```
2. Set proper permissions:
   ```bash
   chmod 600 /var/www/townranker.com/.credentials/service-account-key.json
   ```

### Step 3: Share Your Calendar
1. Open Google Calendar
2. Find the calendar you want to sync
3. Click the three dots → "Settings and sharing"
4. Under "Share with specific people", add the service account email
   (found in the JSON file as `client_email`)
5. Set permission to "Make changes to events"

### Step 4: Test Service Account
```bash
# Check status
curl http://localhost:3001/api/calendar-service/service/status

# Get service account email
curl http://localhost:3001/api/calendar-service/service/email

# List events
curl http://localhost:3001/api/calendar-service/service/events
```

## Testing the Integration

### OAuth Method Test:
```bash
# Check auth status
curl http://localhost:3001/api/calendar/auth/status

# If not authenticated, get auth URL
curl http://localhost:3001/api/calendar/auth/status | grep authUrl
```

### Service Account Test:
```bash
# Test service account
curl http://localhost:3001/api/calendar-service/service/status
```

### Full Sync Test:
```bash
# Run the test script
/tmp/test-calendar-workflow-sync.sh
```

## Admin Dashboard Status

- The calendar widget on `/login.html` now shows a status pill (Connected / Not connected / Needs attention).
- "Needs attention" usually means the server is missing OAuth credentials. The **Connect Calendar** button stays disabled until either the `.env` values or the `.credentials/google-credentials.json` file exist.
- Once the button is enabled, connect through the admin UI—after a successful Google consent flow it will switch to **Connected** and you can refresh events from the same panel.
- If tokens expire, the badge will drop back to **Not connected** and the connect button reappears.

## Troubleshooting

### Common Issues:

1. **"redirect_uri_mismatch"**
   - Make sure every redirect URI in Google Console matches exactly
   - If you're testing on a different host/port, set `GOOGLE_REDIRECT_URI` (single value) or `GOOGLE_REDIRECT_URIS` (comma-separated) so the server generates the matching callback
   - Google still requires HTTPS for public domains—use `https://townranker.com/...` in production and `http://localhost:3001/...` locally

2. **"Access blocked" error**
   - OAuth consent screen not configured
   - Test users not added
   - Using localhost instead of IP/domain

3. **Service account can't access calendar**
   - Calendar not shared with service account email
   - Wrong permissions (needs "Make changes to events")

4. **Token expiration**
   - OAuth tokens expire after 7 days in test mode
   - Move app to production in Google Console for longer tokens

## Current Configuration

- Server IP: `5.78.81.114`
- Port: `3001`
- Domain: `townranker.com`
- Current Client ID: `410008002816-pja5c9estqiloavso5dinnc7ij2squ45.apps.googleusercontent.com`

## API Endpoints

### OAuth Authentication:
- Auth Status: `GET /api/calendar/auth/status`
- Start Auth: `GET /api/calendar/auth`
- Callback: `GET /api/calendar/oauth2callback`

### Service Account:
- Status: `GET /api/calendar-service/service/status`
- Setup Instructions: `GET /api/calendar-service/service/setup`
- Get Email: `GET /api/calendar-service/service/email`

### Sync Operations:
- Board to Calendar: `POST /api/sync/board/:boardId/to-calendar`
- Calendar to Board: `POST /api/sync/board/:boardId/from-calendar`
- Bidirectional: `POST /api/sync/board/:boardId/bidirectional`
