const express = require('express');
const router = express.Router();
const WorkflowCalendarSync = require('../services/syncService');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs').promises;

// OAuth2 client (shared with calendar.js)
let oAuth2Client;
let syncService;

// Initialize OAuth2 and sync service
async function initializeSync() {
    try {
        const credentials = {
            installed: {
                client_id: process.env.GOOGLE_CLIENT_ID || '410008002816-pja5c9estqiloavso5dinnc7ij2squ45.apps.googleusercontent.com',
                client_secret: process.env.GOOGLE_CLIENT_SECRET || 'GOCSPX-YOUR_SECRET_HERE',
                redirect_uris: [
                    'http://5.78.81.114:3001/api/calendar/oauth2callback',
                    'https://townranker.com/api/calendar/oauth2callback',
                    'http://localhost:3001/api/calendar/oauth2callback'
                ]
            }
        };

        const { client_id, client_secret, redirect_uris } = credentials.installed;
        oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        // Try to load saved token
        const TOKEN_PATH = path.join(__dirname, '../../.credentials/calendar-token.json');
        try {
            const token = await fs.readFile(TOKEN_PATH, 'utf8');
            oAuth2Client.setCredentials(JSON.parse(token));
            syncService = new WorkflowCalendarSync(oAuth2Client);
            console.log('🔄 Workflow sync service initialized');
        } catch (err) {
            console.log('🔄 Sync service waiting for calendar authentication');
        }
    } catch (error) {
        console.error('Error initializing sync service:', error);
    }
}

// Initialize on startup
initializeSync();

// Middleware to check sync service availability
function requireSyncService(req, res, next) {
    if (!syncService) {
        return res.status(503).json({ 
            error: 'Sync service not available. Please authenticate with Google Calendar first.',
            authUrl: '/api/calendar/auth'
        });
    }
    next();
}

/**
 * Sync a specific board to Google Calendar
 */
router.post('/board/:boardId/to-calendar', requireSyncService, async (req, res) => {
    try {
        const { boardId } = req.params;
        const { includeCompleted = false } = req.body;

        console.log(`🔄 Starting sync: Board ${boardId} → Calendar`);
        
        const results = await syncService.syncBoardToCalendar(boardId, {
            includeCompleted
        });

        console.log(`✅ Sync completed: Created ${results.created}, Updated ${results.updated}, Failed ${results.failed}`);
        
        res.json({
            success: true,
            results,
            message: `Synced ${results.created + results.updated} tasks to calendar`
        });
    } catch (error) {
        console.error('Board to calendar sync error:', error);
        res.status(500).json({ 
            error: 'Failed to sync board to calendar',
            details: error.message 
        });
    }
});

/**
 * Sync calendar events back to workflow
 */
router.post('/board/:boardId/from-calendar', requireSyncService, async (req, res) => {
    try {
        const { boardId } = req.params;
        const { timeMin, timeMax } = req.body;

        console.log(`🔄 Starting sync: Calendar → Board ${boardId}`);
        
        const results = await syncService.syncCalendarToWorkflow(boardId, timeMin, timeMax);

        console.log(`✅ Sync completed: Updated ${results.updated} tasks from calendar`);
        
        res.json({
            success: true,
            results,
            message: `Updated ${results.updated} tasks from calendar`
        });
    } catch (error) {
        console.error('Calendar to board sync error:', error);
        res.status(500).json({ 
            error: 'Failed to sync calendar to board',
            details: error.message 
        });
    }
});

/**
 * Bi-directional sync
 */
router.post('/board/:boardId/bidirectional', requireSyncService, async (req, res) => {
    try {
        const { boardId } = req.params;
        const { strategy = 'recent' } = req.body; // recent, calendar, workflow

        console.log(`🔄 Starting bi-directional sync for board ${boardId}`);
        
        // First sync from calendar to workflow to get latest changes
        const fromCalendar = await syncService.syncCalendarToWorkflow(boardId);
        
        // Then sync from workflow to calendar
        const toCalendar = await syncService.syncBoardToCalendar(boardId);

        const results = {
            fromCalendar,
            toCalendar,
            totalSynced: fromCalendar.updated + toCalendar.created + toCalendar.updated
        };

        console.log(`✅ Bi-directional sync completed: ${results.totalSynced} items synced`);
        
        res.json({
            success: true,
            results,
            message: `Synced ${results.totalSynced} items`
        });
    } catch (error) {
        console.error('Bi-directional sync error:', error);
        res.status(500).json({ 
            error: 'Failed to perform bi-directional sync',
            details: error.message 
        });
    }
});

/**
 * Sync a single task to calendar
 */
router.post('/task/:taskId/to-calendar', requireSyncService, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { boardId, groupId, board, task } = req.body;

        if (!boardId || !task) {
            return res.status(400).json({ error: 'boardId and task data are required' });
        }

        console.log(`🔄 Syncing task ${taskId} to calendar`);

        let eventId;
        if (task.calendarEventId) {
            // Update existing
            await syncService.updateCalendarEvent(task, board);
            eventId = task.calendarEventId;
        } else {
            // Create new
            eventId = await syncService.createCalendarEvent(task, board);
            await syncService.updateTaskWithEventId(boardId, groupId, taskId, eventId);
        }

        res.json({
            success: true,
            eventId,
            message: 'Task synced to calendar'
        });
    } catch (error) {
        console.error('Task sync error:', error);
        res.status(500).json({ 
            error: 'Failed to sync task to calendar',
            details: error.message 
        });
    }
});

/**
 * Delete calendar event when task is deleted
 */
router.delete('/task/:taskId/calendar-event', requireSyncService, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { calendarEventId } = req.body;

        if (!calendarEventId) {
            return res.status(400).json({ error: 'calendarEventId is required' });
        }

        console.log(`🗑️ Deleting calendar event ${calendarEventId} for task ${taskId}`);

        const deleted = await syncService.deleteCalendarEvent(calendarEventId);

        res.json({
            success: deleted,
            message: deleted ? 'Calendar event deleted' : 'Failed to delete calendar event'
        });
    } catch (error) {
        console.error('Delete calendar event error:', error);
        res.status(500).json({ 
            error: 'Failed to delete calendar event',
            details: error.message 
        });
    }
});

/**
 * Setup webhook for real-time calendar updates
 */
router.post('/webhook/setup', requireSyncService, async (req, res) => {
    try {
        const { webhookUrl } = req.body;

        if (!webhookUrl) {
            return res.status(400).json({ error: 'webhookUrl is required' });
        }

        console.log(`🎣 Setting up calendar webhook: ${webhookUrl}`);

        const channel = await syncService.setupCalendarWebhook(webhookUrl);

        res.json({
            success: true,
            channel,
            message: 'Webhook setup successful'
        });
    } catch (error) {
        console.error('Webhook setup error:', error);
        res.status(500).json({ 
            error: 'Failed to setup webhook',
            details: error.message 
        });
    }
});

/**
 * Handle webhook notifications from Google Calendar
 */
router.post('/webhook/notify', async (req, res) => {
    try {
        const { headers, body } = req;
        
        // Verify this is from Google
        const channelId = headers['x-goog-channel-id'];
        const resourceState = headers['x-goog-resource-state'];
        
        console.log(`📬 Webhook notification: Channel ${channelId}, State: ${resourceState}`);

        if (resourceState === 'sync') {
            // Initial sync message
            res.status(200).send('OK');
            return;
        }

        // Handle the calendar change
        if (syncService && resourceState === 'exists') {
            // Trigger sync for affected boards
            // You might want to queue this for async processing
            console.log('📅 Calendar changed, triggering sync...');
            
            // Get affected board from your tracking system
            // For now, we'll acknowledge the webhook
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(200).send('OK'); // Always return 200 to avoid retries
    }
});

/**
 * Get sync status for a board
 */
router.get('/board/:boardId/status', requireSyncService, async (req, res) => {
    try {
        const { boardId } = req.params;

        // This would typically check a database for sync status
        // For now, return a mock status
        const status = {
            boardId,
            lastSyncedAt: new Date().toISOString(),
            syncEnabled: true,
            pendingTasks: 0,
            errors: []
        };

        res.json({
            success: true,
            status
        });
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ 
            error: 'Failed to get sync status',
            details: error.message 
        });
    }
});

/**
 * Configure sync settings for a board
 */
router.put('/board/:boardId/settings', requireSyncService, async (req, res) => {
    try {
        const { boardId } = req.params;
        const { 
            autoSync = false, 
            syncInterval = 15, // minutes
            conflictResolution = 'recent',
            includeCompleted = false 
        } = req.body;

        // Store these settings (in database or config file)
        const settings = {
            boardId,
            autoSync,
            syncInterval,
            conflictResolution,
            includeCompleted,
            updatedAt: new Date().toISOString()
        };

        console.log(`⚙️ Updated sync settings for board ${boardId}:`, settings);

        res.json({
            success: true,
            settings,
            message: 'Sync settings updated'
        });
    } catch (error) {
        console.error('Settings update error:', error);
        res.status(500).json({ 
            error: 'Failed to update sync settings',
            details: error.message 
        });
    }
});

/**
 * Get all boards with sync enabled
 */
router.get('/boards/enabled', requireSyncService, async (req, res) => {
    try {
        // This would typically query a database
        // For now, return mock data
        const boards = [
            {
                boardId: 'example-board-1',
                boardName: 'Development Tasks',
                syncEnabled: true,
                lastSyncedAt: new Date().toISOString()
            }
        ];

        res.json({
            success: true,
            boards,
            count: boards.length
        });
    } catch (error) {
        console.error('Get enabled boards error:', error);
        res.status(500).json({ 
            error: 'Failed to get enabled boards',
            details: error.message 
        });
    }
});

module.exports = router;