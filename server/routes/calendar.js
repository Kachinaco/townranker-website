const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

// Google Calendar API configuration
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = path.join(__dirname, '../../.credentials/calendar-token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../../.credentials/google-credentials.json');
const DEFAULT_REDIRECT_URIS = [
    'https://townranker.com/api/calendar/oauth2callback',
    'http://5.78.81.114:3001/api/calendar/oauth2callback',
    'http://localhost:3001/api/calendar/oauth2callback'
];

let oauthConfig = null;
let tokenData = null;
let primaryAuthClient = null;

const dedupeList = (list = []) => {
    const seen = new Set();
    return list
        .filter(Boolean)
        .map((value) => value.trim())
        .filter((value) => {
            const key = value.toLowerCase();
            if (!value || seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
};

const parseEnvRedirectUris = () => {
    const manualUris = [];
    if (process.env.GOOGLE_REDIRECT_URI) {
        manualUris.push(process.env.GOOGLE_REDIRECT_URI);
    }
    if (process.env.GOOGLE_REDIRECT_URIS) {
        manualUris.push(...process.env.GOOGLE_REDIRECT_URIS.split(','));
    }
    return dedupeList(manualUris);
};

async function loadCredentialsFromFile() {
    try {
        const raw = await fs.readFile(CREDENTIALS_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        const credentials = parsed.web || parsed.installed;

        if (!credentials?.client_id || !credentials?.client_secret) {
            console.warn('⚠️  Google credentials file missing client_id or client_secret');
            return null;
        }

        const fileRedirects = credentials.redirect_uris || credentials.redirectUris || [];
        return {
            clientId: credentials.client_id,
            clientSecret: credentials.client_secret,
            redirectUris: dedupeList([...fileRedirects, ...DEFAULT_REDIRECT_URIS])
        };
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`⚠️  Google credentials file not found at ${CREDENTIALS_PATH}`);
        } else {
            console.error('⚠️  Failed to read Google credentials file:', error.message);
        }
        return null;
    }
}

async function buildOAuthConfig() {
    const envClientId = process.env.GOOGLE_CLIENT_ID;
    const envClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const manualRedirects = parseEnvRedirectUris();

    if (envClientId && envClientSecret) {
        return {
            clientId: envClientId,
            clientSecret: envClientSecret,
            redirectUris: dedupeList([...manualRedirects, ...DEFAULT_REDIRECT_URIS])
        };
    }

    const fileConfig = await loadCredentialsFromFile();
    if (fileConfig) {
        fileConfig.redirectUris = dedupeList([...manualRedirects, ...(fileConfig.redirectUris || []), ...DEFAULT_REDIRECT_URIS]);
        return fileConfig;
    }

    return null;
}

async function loadSavedToken() {
    try {
        const tokenRaw = await fs.readFile(TOKEN_PATH, 'utf8');
        tokenData = JSON.parse(tokenRaw);
        if (!primaryAuthClient && oauthConfig) {
            primaryAuthClient = createOAuthClient();
        }
        if (primaryAuthClient) {
            primaryAuthClient.setCredentials(tokenData);
        }
        console.log('📅 Google Calendar token loaded successfully');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('📅 No saved calendar token found, authentication required');
        } else {
            console.error('⚠️  Failed to read saved calendar token:', error.message);
        }
    }
}

function createOAuthClient(redirectUri) {
    if (!oauthConfig) {
        return null;
    }
    const client = new google.auth.OAuth2(
        oauthConfig.clientId,
        oauthConfig.clientSecret,
        redirectUri || oauthConfig.redirectUris[0]
    );

    if (tokenData) {
        client.setCredentials(tokenData);
    }

    return client;
}

function getAuthorizedClient() {
    if (!oauthConfig) {
        return null;
    }
    if (!primaryAuthClient) {
        primaryAuthClient = createOAuthClient();
    }
    if (tokenData && primaryAuthClient && (!primaryAuthClient.credentials || !primaryAuthClient.credentials.access_token)) {
        primaryAuthClient.setCredentials(tokenData);
    }
    return primaryAuthClient;
}

async function saveToken(tokens) {
    tokenData = tokens;
    await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
    if (primaryAuthClient) {
        primaryAuthClient.setCredentials(tokens);
    }
}

function determineRedirectUri(req) {
    if (!oauthConfig) {
        return null;
    }

    const explicit = (process.env.GOOGLE_REDIRECT_URI || '').trim();
    if (explicit) {
        return explicit;
    }

    if (req) {
        const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0];
        const forwardedHost = req.headers['x-forwarded-host'];
        const origin = req.headers.origin;
        const host = forwardedHost || req.headers.host;

        if (origin) {
            const match = oauthConfig.redirectUris.find((uri) => uri.startsWith(origin));
            if (match) {
                return match;
            }
        }

        if (host) {
            const hostLower = host.toLowerCase();
            const hostWithoutPort = hostLower.split(':')[0];
            const hostMatch = oauthConfig.redirectUris.find((uri) => {
                const lower = uri.toLowerCase();
                return lower.includes(hostLower) || lower.includes(hostWithoutPort);
            });

            if (hostMatch) {
                return hostMatch;
            }

            const protocol = forwardedProto || req.protocol || 'http';
            return `${protocol}://${host}/api/calendar/oauth2callback`;
        }
    }

    return oauthConfig.redirectUris[0];
}

function getAuthUrl(req) {
    if (!oauthConfig) {
        return null;
    }
    const redirectUri = determineRedirectUri(req);
    const authClient = createOAuthClient(redirectUri);
    if (!authClient) {
        return null;
    }
    return authClient.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });
}

// Initialize on startup
async function initializeAuth() {
    try {
        oauthConfig = await buildOAuthConfig();
        if (!oauthConfig) {
            console.warn('⚠️  Google Calendar OAuth is not configured. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET or provide .credentials/google-credentials.json');
            return;
        }
        primaryAuthClient = createOAuthClient();
        await loadSavedToken();
    } catch (error) {
        console.error('Error initializing Google Calendar auth:', error);
    }
}

initializeAuth();

// Middleware to check authentication
function requireAuth(req, res, next) {
    if (!oauthConfig) {
        return res.status(503).json({ error: 'Google Calendar is not configured' });
    }
    const client = getAuthorizedClient();
    if (!client || !client.credentials || !client.credentials.access_token) {
        return res.status(401).json({
            error: 'Not authenticated',
            authUrl: getAuthUrl(req)
        });
    }
    req.googleAuthClient = client;
    next();
}

// Check authentication status
router.get('/auth/status', (req, res) => {
    const client = getAuthorizedClient();
    const isAuthenticated = !!(client && client.credentials && client.credentials.access_token);
    res.json({
        authenticated: isAuthenticated,
        configured: !!oauthConfig,
        redirectUri: determineRedirectUri(req),
        authUrl: !isAuthenticated ? getAuthUrl(req) : null
    });
});

// Start OAuth flow
router.get('/auth', (req, res) => {
    if (!oauthConfig) {
        return res.status(503).json({ error: 'Google Calendar is not configured' });
    }
    const authUrl = getAuthUrl(req);
    if (authUrl) {
        res.redirect(authUrl);
    } else {
        res.status(500).json({ error: 'Failed to generate auth URL' });
    }
});

// OAuth2 callback
router.get('/oauth2callback', async (req, res) => {
    if (!oauthConfig) {
        return res.status(503).send('Google Calendar is not configured');
    }

    const { code } = req.query;
    if (!code) {
        return res.status(400).send('No authorization code provided');
    }

    try {
        const redirectUri = determineRedirectUri(req);
        const authClient = createOAuthClient(redirectUri);
        const { tokens } = await authClient.getToken(code);
        await saveToken(tokens);

        console.log('📅 Google Calendar authenticated successfully');
        
        // Redirect back to dashboard
        res.redirect('/login.html?calendar=connected');
    } catch (error) {
        console.error('Error during OAuth callback:', error);
        res.status(500).send('Authentication failed');
    }
});

// Sign out
router.post('/signout', async (req, res) => {
    try {
        const client = getAuthorizedClient();
        if (client && client.credentials) {
            await client.revokeCredentials();
        }

        tokenData = null;
        primaryAuthClient = createOAuthClient();

        try {
            await fs.unlink(TOKEN_PATH);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.error('Failed to remove calendar token:', err.message);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error signing out:', error);
        res.status(500).json({ error: 'Failed to sign out' });
    }
});

// List calendar events
router.get('/events', requireAuth, async (req, res) => {
    try {
        const calendar = google.calendar({
            version: 'v3',
            auth: req.googleAuthClient || getAuthorizedClient()
        });
        
        const { timeMin = new Date().toISOString(), maxResults = 20 } = req.query;
        
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: timeMin,
            maxResults: parseInt(maxResults),
            singleEvents: true,
            orderBy: 'startTime'
        });

        res.json({
            success: true,
            events: response.data.items || []
        });
    } catch (error) {
        console.error('Error fetching events:', error);
        
        // Check if token expired
        if (error.code === 401) {
            return res.status(401).json({ 
                error: 'Token expired', 
                authUrl: getAuthUrl(req) 
            });
        }
        
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// Create a new event
router.post('/events', requireAuth, async (req, res) => {
    try {
        const calendar = google.calendar({
            version: 'v3',
            auth: req.googleAuthClient || getAuthorizedClient()
        });
        
        const { summary, location, description, startDateTime, endDateTime, attendees } = req.body;
        
        const event = {
            summary: summary || 'New Event',
            location: location,
            description: description,
            start: {
                dateTime: startDateTime,
                timeZone: 'America/Phoenix'
            },
            end: {
                dateTime: endDateTime,
                timeZone: 'America/Phoenix'
            },
            attendees: attendees || [],
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 },
                    { method: 'popup', minutes: 10 }
                ]
            }
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            sendUpdates: 'all'
        });

        console.log(`📅 Event created: ${response.data.summary}`);
        
        res.json({
            success: true,
            event: response.data
        });
    } catch (error) {
        console.error('Error creating event:', error);
        if (error.code === 401) {
            return res.status(401).json({ 
                error: 'Token expired', 
                authUrl: getAuthUrl(req) 
            });
        }
        res.status(500).json({ error: 'Failed to create event' });
    }
});

// Update an event
router.put('/events/:eventId', requireAuth, async (req, res) => {
    try {
        const calendar = google.calendar({
            version: 'v3',
            auth: req.googleAuthClient || getAuthorizedClient()
        });
        const { eventId } = req.params;
        const { summary, location, description, startDateTime, endDateTime } = req.body;
        
        const event = {
            summary,
            location,
            description,
            start: {
                dateTime: startDateTime,
                timeZone: 'America/Phoenix'
            },
            end: {
                dateTime: endDateTime,
                timeZone: 'America/Phoenix'
            }
        };

        const response = await calendar.events.update({
            calendarId: 'primary',
            eventId: eventId,
            resource: event
        });

        console.log(`📅 Event updated: ${response.data.summary}`);
        
        res.json({
            success: true,
            event: response.data
        });
    } catch (error) {
        console.error('Error updating event:', error);
        if (error.code === 401) {
            return res.status(401).json({ 
                error: 'Token expired', 
                authUrl: getAuthUrl(req) 
            });
        }
        res.status(500).json({ error: 'Failed to update event' });
    }
});

// Delete an event
router.delete('/events/:eventId', requireAuth, async (req, res) => {
    try {
        const calendar = google.calendar({
            version: 'v3',
            auth: req.googleAuthClient || getAuthorizedClient()
        });
        const { eventId } = req.params;
        
        await calendar.events.delete({
            calendarId: 'primary',
            eventId: eventId
        });

        console.log(`📅 Event deleted: ${eventId}`);
        
        res.json({
            success: true,
            message: 'Event deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting event:', error);
        if (error.code === 401) {
            return res.status(401).json({ 
                error: 'Token expired', 
                authUrl: getAuthUrl(req) 
            });
        }
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

// Get a single event
router.get('/events/:eventId', requireAuth, async (req, res) => {
    try {
        const calendar = google.calendar({
            version: 'v3',
            auth: req.googleAuthClient || getAuthorizedClient()
        });
        const { eventId } = req.params;
        
        const response = await calendar.events.get({
            calendarId: 'primary',
            eventId: eventId
        });

        res.json({
            success: true,
            event: response.data
        });
    } catch (error) {
        console.error('Error fetching event:', error);
        if (error.code === 401) {
            return res.status(401).json({ 
                error: 'Token expired', 
                authUrl: getAuthUrl(req) 
            });
        }
        res.status(500).json({ error: 'Failed to fetch event' });
    }
});

// Quick add event (using natural language)
router.post('/events/quickAdd', requireAuth, async (req, res) => {
    try {
        const calendar = google.calendar({
            version: 'v3',
            auth: req.googleAuthClient || getAuthorizedClient()
        });
        const { text } = req.body;
        
        const response = await calendar.events.quickAdd({
            calendarId: 'primary',
            text: text
        });

        console.log(`📅 Quick event created: ${text}`);
        
        res.json({
            success: true,
            event: response.data
        });
    } catch (error) {
        console.error('Error quick adding event:', error);
        if (error.code === 401) {
            return res.status(401).json({ 
                error: 'Token expired', 
                authUrl: getAuthUrl(req) 
            });
        }
        res.status(500).json({ error: 'Failed to quick add event' });
    }
});

module.exports = router;
