/**
 * Reddit Leads API Routes
 * Handles Reddit lead management and monitor configuration
 */

const express = require('express');
const router = express.Router();
const RedditLead = require('../models/RedditLead');
const RedditMonitorConfig = require('../models/RedditMonitorConfig');
const redditMonitorService = require('../services/redditMonitorService');

// ============================================
// REDDIT LEADS ENDPOINTS
// ============================================

/**
 * GET /api/reddit-leads
 * List Reddit leads with filters and pagination
 */
router.get('/', async (req, res) => {
    try {
        const {
            status,
            priority,
            subreddit,
            monitorId,
            limit = 50,
            page = 1,
            sort = '-discoveredAt'
        } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (subreddit) filter.subreddit = new RegExp(subreddit, 'i');
        if (monitorId) filter.monitorId = monitorId;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [leads, total] = await Promise.all([
            RedditLead.find(filter)
                .sort(sort)
                .limit(parseInt(limit))
                .skip(skip),
            RedditLead.countDocuments(filter)
        ]);

        res.json({
            success: true,
            leads,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching Reddit leads:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/reddit-leads/stats
 * Get Reddit lead statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const [byStatus, byPriority, bySubreddit, recent] = await Promise.all([
            // Count by status
            RedditLead.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            // Count by priority
            RedditLead.aggregate([
                { $group: { _id: '$priority', count: { $sum: 1 } } }
            ]),
            // Top subreddits
            RedditLead.aggregate([
                { $group: { _id: '$subreddit', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            // Recent leads (last 7 days)
            RedditLead.countDocuments({
                discoveredAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            })
        ]);

        res.json({
            success: true,
            stats: {
                byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
                byPriority: byPriority.reduce((acc, p) => ({ ...acc, [p._id]: p.count }), {}),
                topSubreddits: bySubreddit,
                recentCount: recent,
                total: await RedditLead.countDocuments()
            }
        });
    } catch (error) {
        console.error('Error fetching Reddit lead stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/reddit-leads/:id
 * Get a single Reddit lead
 */
router.get('/:id', async (req, res) => {
    try {
        const lead = await RedditLead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        res.json({ success: true, lead });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PATCH /api/reddit-leads/:id
 * Update a Reddit lead (status, notes, etc.)
 */
router.patch('/:id', async (req, res) => {
    try {
        const allowedUpdates = ['status', 'responded', 'responseDate', 'responseNotes'];
        const updates = {};

        for (const key of allowedUpdates) {
            if (req.body[key] !== undefined) {
                updates[key] = req.body[key];
            }
        }

        if (req.body.responded && !updates.responseDate) {
            updates.responseDate = new Date();
        }

        const lead = await RedditLead.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true }
        );

        if (!lead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }

        res.json({ success: true, lead });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/reddit-leads/:id/convert
 * Convert Reddit lead to full Lead
 */
router.post('/:id/convert', async (req, res) => {
    try {
        const redditLead = await RedditLead.findById(req.params.id);
        if (!redditLead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }

        if (redditLead.status === 'converted') {
            return res.status(400).json({
                success: false,
                error: 'Lead already converted',
                convertedToLeadId: redditLead.convertedToLeadId
            });
        }

        const lead = await redditLead.convertToLead();

        res.json({
            success: true,
            message: 'Lead converted successfully',
            redditLead,
            lead
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/reddit-leads/:id
 * Delete a Reddit lead
 */
router.delete('/:id', async (req, res) => {
    try {
        const lead = await RedditLead.findByIdAndDelete(req.params.id);
        if (!lead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        res.json({ success: true, message: 'Lead deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// MONITOR CONFIGURATION ENDPOINTS
// ============================================

/**
 * GET /api/reddit-leads/monitors/list
 * List all monitor configurations
 */
router.get('/monitors/list', async (req, res) => {
    try {
        const monitors = await RedditMonitorConfig.find().sort({ createdAt: -1 });

        // Add service status
        const serviceStatus = redditMonitorService.getStatus();

        res.json({
            success: true,
            monitors,
            serviceStatus
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/reddit-leads/monitors/:id
 * Get a single monitor configuration
 */
router.get('/monitors/:id', async (req, res) => {
    try {
        const monitor = await RedditMonitorConfig.findOne({ monitorId: req.params.id });
        if (!monitor) {
            return res.status(404).json({ success: false, error: 'Monitor not found' });
        }

        // Get lead count for this monitor
        const leadCount = await RedditLead.countDocuments({ monitorId: req.params.id });

        res.json({
            success: true,
            monitor,
            leadCount
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/reddit-leads/monitors
 * Create a new monitor configuration
 */
router.post('/monitors', async (req, res) => {
    try {
        const {
            monitorId,
            name,
            businessName,
            targetSubreddits,
            searchTerms,
            highIntentPhrases,
            serviceKeywords,
            locationKeywords,
            exclusionKeywords,
            scoring,
            slackWebhookUrl,
            slackEnabled,
            intervalMinutes
        } = req.body;

        if (!monitorId || !name) {
            return res.status(400).json({
                success: false,
                error: 'monitorId and name are required'
            });
        }

        // Check for duplicate
        const existing = await RedditMonitorConfig.findOne({ monitorId });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Monitor with this ID already exists'
            });
        }

        const monitor = new RedditMonitorConfig({
            monitorId,
            name,
            businessName,
            targetSubreddits: targetSubreddits || [],
            searchTerms: searchTerms || ['window', 'door', 'glass'],
            highIntentPhrases: highIntentPhrases || [],
            serviceKeywords: serviceKeywords || [],
            locationKeywords: locationKeywords || [],
            exclusionKeywords: exclusionKeywords || [],
            scoring: scoring || {},
            slackWebhookUrl,
            slackEnabled: slackEnabled !== false,
            intervalMinutes: intervalMinutes || 30,
            isActive: true
        });

        await monitor.save();

        // Start the monitor if service is initialized
        if (monitor.isActive) {
            redditMonitorService.startMonitor(monitor.monitorId, monitor.intervalMinutes);
        }

        res.json({ success: true, monitor });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/reddit-leads/monitors/:id
 * Update a monitor configuration
 */
router.put('/monitors/:id', async (req, res) => {
    try {
        const monitor = await RedditMonitorConfig.findOneAndUpdate(
            { monitorId: req.params.id },
            req.body,
            { new: true }
        );

        if (!monitor) {
            return res.status(404).json({ success: false, error: 'Monitor not found' });
        }

        // Restart monitor with new settings if active
        redditMonitorService.stopMonitor(monitor.monitorId);
        if (monitor.isActive) {
            redditMonitorService.startMonitor(monitor.monitorId, monitor.intervalMinutes);
        }

        res.json({ success: true, monitor });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/reddit-leads/monitors/:id/toggle
 * Toggle monitor active status
 */
router.post('/monitors/:id/toggle', async (req, res) => {
    try {
        const monitor = await RedditMonitorConfig.findOne({ monitorId: req.params.id });
        if (!monitor) {
            return res.status(404).json({ success: false, error: 'Monitor not found' });
        }

        monitor.isActive = !monitor.isActive;
        await monitor.save();

        if (monitor.isActive) {
            redditMonitorService.startMonitor(monitor.monitorId, monitor.intervalMinutes);
        } else {
            redditMonitorService.stopMonitor(monitor.monitorId);
        }

        res.json({
            success: true,
            isActive: monitor.isActive,
            message: monitor.isActive ? 'Monitor started' : 'Monitor stopped'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/reddit-leads/monitors/:id/run
 * Manually trigger a monitor run
 */
router.post('/monitors/:id/run', async (req, res) => {
    try {
        const monitor = await RedditMonitorConfig.findOne({ monitorId: req.params.id });
        if (!monitor) {
            return res.status(404).json({ success: false, error: 'Monitor not found' });
        }

        // Run synchronously and return results
        const stats = await redditMonitorService.runMonitor(req.params.id);

        if (!stats) {
            return res.status(400).json({
                success: false,
                error: 'Monitor run failed. Check if Reddit API is configured.'
            });
        }

        res.json({
            success: true,
            message: `Found ${stats.leadsFound} leads`,
            stats
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/reddit-leads/monitors/:id
 * Delete a monitor configuration
 */
router.delete('/monitors/:id', async (req, res) => {
    try {
        // Stop the monitor first
        redditMonitorService.stopMonitor(req.params.id);

        const monitor = await RedditMonitorConfig.findOneAndDelete({ monitorId: req.params.id });
        if (!monitor) {
            return res.status(404).json({ success: false, error: 'Monitor not found' });
        }

        res.json({ success: true, message: 'Monitor deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/reddit-leads/service/status
 * Get Reddit monitor service status
 */
router.get('/service/status', (req, res) => {
    const status = redditMonitorService.getStatus();
    res.json({ success: true, ...status });
});

module.exports = router;
