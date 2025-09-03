const express = require('express');
const router = express.Router();
const WebhookLog = require('../models/WebhookLog');
const Communication = require('../models/Communication');
const Lead = require('../models/Lead');

// Middleware to check admin authentication
const requireAuth = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Get comprehensive webhook dashboard
router.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const { hours = 24, provider = 'openphone' } = req.query;
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        
        // Get webhook statistics
        const stats = await WebhookLog.getStats(hours);
        const failureRate = await WebhookLog.getFailureRate(provider, hours);
        
        // Get webhook counts by status
        const statusCounts = await WebhookLog.aggregate([
            { 
                $match: { 
                    provider: provider,
                    createdAt: { $gte: since } 
                } 
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Get processing time statistics
        const processingStats = await WebhookLog.aggregate([
            { 
                $match: { 
                    provider: provider,
                    createdAt: { $gte: since },
                    processingTime: { $exists: true, $ne: null }
                } 
            },
            {
                $group: {
                    _id: null,
                    avgProcessingTime: { $avg: '$processingTime' },
                    minProcessingTime: { $min: '$processingTime' },
                    maxProcessingTime: { $max: '$processingTime' },
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Get recent failed webhooks
        const recentFailures = await WebhookLog.find({
            provider: provider,
            status: 'failed',
            createdAt: { $gte: since }
        })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('eventType error createdAt processingTime signatureValid payload');
        
        // Get hourly distribution
        const hourlyData = await WebhookLog.aggregate([
            { 
                $match: { 
                    provider: provider,
                    createdAt: { $gte: since }
                } 
            },
            {
                $group: {
                    _id: {
                        hour: { $hour: '$createdAt' },
                        status: '$status'
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.hour': 1 } }
        ]);
        
        // Get signature verification issues
        const signatureIssues = await WebhookLog.countDocuments({
            provider: provider,
            signatureValid: false,
            createdAt: { $gte: since }
        });
        
        // Get related communication data
        const smsStats = await Communication.aggregate([
            {
                $match: {
                    platform: 'openphone',
                    createdAt: { $gte: since }
                }
            },
            {
                $group: {
                    _id: '$direction',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        res.json({
            success: true,
            dashboard: {
                timeframe: `${hours} hours`,
                provider: provider,
                overview: {
                    totalWebhooks: statusCounts.reduce((sum, s) => sum + s.count, 0),
                    successRate: failureRate[0] ? (100 - failureRate[0].failureRate) : 100,
                    failureRate: failureRate[0]?.failureRate || 0,
                    signatureIssues: signatureIssues
                },
                performance: processingStats[0] || {
                    avgProcessingTime: 0,
                    minProcessingTime: 0,
                    maxProcessingTime: 0,
                    count: 0
                },
                statusBreakdown: Object.fromEntries(
                    statusCounts.map(s => [s._id, s.count])
                ),
                hourlyDistribution: hourlyData,
                recentFailures: recentFailures,
                smsActivity: Object.fromEntries(
                    smsStats.map(s => [s._id, s.count])
                )
            }
        });
        
    } catch (error) {
        console.error('Error generating webhook dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate dashboard',
            details: error.message
        });
    }
});

// Get webhook logs with filtering
router.get('/logs', requireAuth, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            provider = 'openphone',
            status,
            hours = 24,
            eventType
        } = req.query;
        
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Build query
        const query = {
            provider: provider,
            createdAt: { $gte: since }
        };
        
        if (status) query.status = status;
        if (eventType) query.eventType = eventType;
        
        // Get logs
        const logs = await WebhookLog.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select('-rawPayload -payload.data'); // Exclude large fields
            
        const total = await WebhookLog.countDocuments(query);
        
        res.json({
            success: true,
            logs: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
        
    } catch (error) {
        console.error('Error fetching webhook logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch logs',
            details: error.message
        });
    }
});

// Export webhook configuration
router.get('/config', requireAuth, (req, res) => {
    res.json({
        success: true,
        config: {
            openphone: {
                hasApiKey: !!process.env.OPENPHONE_API_KEY,
                hasPhoneNumber: !!process.env.OPENPHONE_PHONE_NUMBER,
                hasWebhookSecret: !!process.env.OPENPHONE_WEBHOOK_SECRET,
                phoneNumber: process.env.OPENPHONE_PHONE_NUMBER || 'Not configured',
                webhookUrl: `${req.protocol}://${req.get('host')}/api/openphone/webhook`
            }
        }
    });
});

module.exports = router;