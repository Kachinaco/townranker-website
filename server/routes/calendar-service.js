const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

/**
 * Service Account Authentication Method
 * This method doesn't require user consent but needs:
 * 1. Service account key file
 * 2. Calendar must be shared with service account email
 */

// Service account configuration
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../../.credentials/service-account-key.json');
let serviceAuth = null;
let calendar = null;

// Initialize service account authentication
async function initializeServiceAccount() {
    try {
        // Check if service account key exists
        const keyFileExists = await fs.access(SERVICE_ACCOUNT_PATH).then(() => true).catch(() => false);
        
        if (!keyFileExists) {
            console.log('📅 Service account key not found. To use service account authentication:');
            console.log('1. Go to Google Cloud Console > IAM & Admin > Service Accounts');
            console.log('2. Create a service account and download the key JSON');
            console.log(`3. Save it to: ${SERVICE_ACCOUNT_PATH}`);
            console.log('4. Share your calendar with the service account email');
            return false;
        }

        // Load service account credentials
        const keyFile = JSON.parse(await fs.readFile(SERVICE_ACCOUNT_PATH, 'utf8'));
        
        // Create auth client
        serviceAuth = new google.auth.GoogleAuth({
            keyFile: SERVICE_ACCOUNT_PATH,
            scopes: ['https://www.googleapis.com/auth/calendar']
        });

        // Get authenticated client
        const authClient = await serviceAuth.getClient();
        
        // Initialize calendar
        calendar = google.calendar({ version: 'v3', auth: authClient });
        
        console.log('✅ Service account authentication initialized');
        console.log(`📧 Service account email: ${keyFile.client_email}`);
        console.log('⚠️  Make sure to share your calendar with this email!');
        
        return true;
    } catch (error) {
        console.error('Failed to initialize service account:', error.message);
        return false;
    }
}

// Initialize on startup
initializeServiceAccount();

// Check service account status
router.get('/service/status', async (req, res) => {
    const isReady = serviceAuth !== null && calendar !== null;
    
    if (isReady) {
        try {
            // Test calendar access
            const response = await calendar.calendarList.list({ maxResults: 1 });
            res.json({
                authenticated: true,
                method: 'service_account',
                calendars: response.data.items?.length || 0,
                message: 'Service account ready'
            });
        } catch (error) {
            res.json({
                authenticated: false,
                method: 'service_account',
                error: 'Service account configured but cannot access calendars',
                hint: 'Make sure to share your calendar with the service account email'
            });
        }
    } else {
        res.json({
            authenticated: false,
            method: 'service_account',
            error: 'Service account not configured',
            setupInstructions: [
                '1. Create service account in Google Cloud Console',
                '2. Download key JSON file',
                `3. Save to: ${SERVICE_ACCOUNT_PATH}`,
                '4. Share calendar with service account email',
                '5. Restart the server'
            ]
        });
    }
});

// List events using service account
router.get('/service/events', async (req, res) => {
    if (!calendar) {
        return res.status(503).json({ error: 'Service account not configured' });
    }

    try {
        const { calendarId = 'primary', timeMin, timeMax, maxResults = 10 } = req.query;
        
        const response = await calendar.events.list({
            calendarId,
            timeMin: timeMin || new Date().toISOString(),
            timeMax: timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            maxResults: parseInt(maxResults),
            singleEvents: true,
            orderBy: 'startTime'
        });

        res.json({
            success: true,
            events: response.data.items || [],
            calendar: calendarId
        });
    } catch (error) {
        console.error('Error listing events:', error);
        res.status(500).json({ 
            error: 'Failed to list events',
            details: error.message,
            hint: 'Make sure the calendar is shared with the service account'
        });
    }
});

// Create event using service account
router.post('/service/events', async (req, res) => {
    if (!calendar) {
        return res.status(503).json({ error: 'Service account not configured' });
    }

    try {
        const { 
            calendarId = 'primary',
            summary,
            description,
            location,
            startDateTime,
            endDateTime,
            attendees 
        } = req.body;

        const event = {
            summary: summary || 'New Event',
            description,
            location,
            start: {
                dateTime: startDateTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                timeZone: 'America/Phoenix'
            },
            end: {
                dateTime: endDateTime || new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
                timeZone: 'America/Phoenix'
            },
            attendees: attendees || []
        };

        const response = await calendar.events.insert({
            calendarId,
            resource: event
        });

        res.json({
            success: true,
            event: response.data,
            message: 'Event created successfully'
        });
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ 
            error: 'Failed to create event',
            details: error.message 
        });
    }
});

// Update event using service account
router.put('/service/events/:eventId', async (req, res) => {
    if (!calendar) {
        return res.status(503).json({ error: 'Service account not configured' });
    }

    try {
        const { eventId } = req.params;
        const { calendarId = 'primary', ...eventData } = req.body;

        const response = await calendar.events.update({
            calendarId,
            eventId,
            resource: eventData
        });

        res.json({
            success: true,
            event: response.data,
            message: 'Event updated successfully'
        });
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({ 
            error: 'Failed to update event',
            details: error.message 
        });
    }
});

// Delete event using service account
router.delete('/service/events/:eventId', async (req, res) => {
    if (!calendar) {
        return res.status(503).json({ error: 'Service account not configured' });
    }

    try {
        const { eventId } = req.params;
        const { calendarId = 'primary' } = req.query;

        await calendar.events.delete({
            calendarId,
            eventId
        });

        res.json({
            success: true,
            message: 'Event deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ 
            error: 'Failed to delete event',
            details: error.message 
        });
    }
});

// Setup instructions endpoint
router.get('/service/setup', (req, res) => {
    res.json({
        instructions: {
            step1: {
                title: 'Create Service Account',
                url: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
                actions: [
                    'Go to Google Cloud Console',
                    'Select or create a project',
                    'Go to IAM & Admin > Service Accounts',
                    'Click "Create Service Account"',
                    'Name it (e.g., "Calendar Sync")',
                    'Grant role: "Calendar API > Calendar Editor"'
                ]
            },
            step2: {
                title: 'Generate Key',
                actions: [
                    'Click on the created service account',
                    'Go to "Keys" tab',
                    'Click "Add Key" > "Create new key"',
                    'Choose JSON format',
                    'Download the key file'
                ]
            },
            step3: {
                title: 'Configure Server',
                actions: [
                    `Save key file to: ${SERVICE_ACCOUNT_PATH}`,
                    'Ensure file permissions are secure (chmod 600)',
                    'Restart the server'
                ]
            },
            step4: {
                title: 'Share Calendar',
                actions: [
                    'Open Google Calendar',
                    'Click settings for the calendar you want to sync',
                    'Go to "Share with specific people"',
                    'Add the service account email (from the JSON file)',
                    'Set permission to "Make changes to events"',
                    'Save'
                ]
            },
            testEndpoint: '/api/calendar-service/service/status'
        }
    });
});

// Get service account email (useful for setup)
router.get('/service/email', async (req, res) => {
    try {
        const keyFileExists = await fs.access(SERVICE_ACCOUNT_PATH).then(() => true).catch(() => false);
        
        if (!keyFileExists) {
            return res.status(404).json({ 
                error: 'Service account key not found',
                path: SERVICE_ACCOUNT_PATH 
            });
        }

        const keyFile = JSON.parse(await fs.readFile(SERVICE_ACCOUNT_PATH, 'utf8'));
        
        res.json({
            email: keyFile.client_email,
            projectId: keyFile.project_id,
            hint: 'Share your Google Calendar with this email address'
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to read service account',
            details: error.message 
        });
    }
});

module.exports = router;