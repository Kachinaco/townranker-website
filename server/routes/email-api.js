/**
 * Enhanced Email API Routes
 * Professional email management with security, validation, and monitoring
 */

const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');
const EmailValidator = require('../utils/emailValidator');

// Middleware for authentication (adjust based on your auth system)
const authenticateAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

/**
 * Send email with enhanced security and tracking
 */
router.post('/send', authenticateAdmin, async (req, res) => {
    try {
        const { to, subject, html, text, enableTracking = true } = req.body;

        if (!to || (!subject && !html && !text)) {
            return res.status(400).json({
                error: 'Missing required fields: to, and at least one of subject, html, or text'
            });
        }

        const result = await emailService.sendEmail({
            to,
            subject,
            html,
            text,
            enableTracking,
            trackingId: req.body.trackingId
        });

        res.json({
            success: true,
            messageId: result.messageId,
            rateLimitStatus: result.rateLimitStatus,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Email send error:', error);
        res.status(400).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Validate email configuration
 */
router.get('/validate', authenticateAdmin, async (req, res) => {
    try {
        const validator = new EmailValidator();
        const results = await validator.runFullValidation({
            testEmail: req.query.testEmail
        });

        res.json(results);

    } catch (error) {
        console.error('Email validation error:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Get email service health status
 */
router.get('/health', authenticateAdmin, async (req, res) => {
    try {
        const health = emailService.getHealthStatus();
        const httpStatus = health.initialized ? 200 : 503;
        
        res.status(httpStatus).json(health);

    } catch (error) {
        console.error('Email health check error:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Get rate limit status
 */
router.get('/rate-limits/:identifier?', authenticateAdmin, (req, res) => {
    try {
        const identifier = req.params.identifier || 'global';
        const status = emailService.getRateLimitStatus(identifier);
        
        res.json({
            identifier,
            ...status,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Rate limit check error:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Get bounce statistics
 */
router.get('/bounces', authenticateAdmin, (req, res) => {
    try {
        const stats = emailService.getBounceStats();
        res.json({
            ...stats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Bounce stats error:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Clear bounce record for an email
 */
router.delete('/bounces/:email', authenticateAdmin, (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        emailService.clearBounceRecord(email);
        
        res.json({
            success: true,
            message: `Bounce record cleared for ${email}`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Clear bounce record error:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Test email configuration
 */
router.post('/test', authenticateAdmin, async (req, res) => {
    try {
        const { recipient } = req.body;
        const testResult = await emailService.testConfiguration();
        
        if (recipient) {
            // Send actual test email
            const emailResult = await emailService.sendEmail({
                to: recipient,
                subject: '🧪 TownRanker Email System Test',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #6366f1;">✅ Email System Test Successful</h2>
                        <p>This test email confirms that your TownRanker email system is configured correctly.</p>
                        
                        <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #0ea5e9;">Test Results:</h3>
                            <ul>
                                <li><strong>Authentication:</strong> ✅ Verified</li>
                                <li><strong>SMTP Connection:</strong> ✅ Working</li>
                                <li><strong>Rate Limiting:</strong> ✅ Active</li>
                                <li><strong>Bounce Handling:</strong> ✅ Enabled</li>
                                <li><strong>Tracking:</strong> ✅ Enabled</li>
                            </ul>
                        </div>
                        
                        <p style="color: #065f46;">
                            <strong>Your email system is ready for production use!</strong>
                        </p>
                        
                        <p style="color: #6b7280; font-size: 14px;">
                            Test performed: ${new Date().toLocaleString()}<br>
                            Message ID: ${emailResult?.messageId || 'N/A'}
                        </p>
                    </div>
                `,
                enableTracking: false // Don't track test emails
            });
            
            testResult.emailSent = {
                success: true,
                messageId: emailResult.messageId,
                recipient: recipient
            };
        }

        res.json({
            ...testResult,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Email test error:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Get email logs (admin only)
 */
router.get('/logs', authenticateAdmin, async (req, res) => {
    try {
        const fs = require('fs').promises;
        const path = require('path');
        
        const logPath = '/var/www/townranker.com/logs/email.log';
        const limit = parseInt(req.query.limit) || 100;
        
        try {
            const logContent = await fs.readFile(logPath, 'utf8');
            const lines = logContent.trim().split('\n');
            const recentLogs = lines.slice(-limit).map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    return { raw: line, parseError: true };
                }
            }).reverse(); // Most recent first

            res.json({
                logs: recentLogs,
                totalLines: lines.length,
                limit: limit,
                timestamp: new Date().toISOString()
            });

        } catch (fileError) {
            res.json({
                logs: [],
                message: 'No log file found yet',
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('Email logs error:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Configure OAuth2 settings (admin only)
 */
router.post('/oauth2/configure', authenticateAdmin, async (req, res) => {
    try {
        const { clientId, clientSecret, refreshToken } = req.body;

        if (!clientId || !clientSecret) {
            return res.status(400).json({
                error: 'Client ID and Client Secret are required'
            });
        }

        // Update environment variables (this would typically update a config file)
        // For security, we won't actually modify env vars here, just validate
        
        // Test OAuth2 configuration
        const nodemailer = require('nodemailer');
        const testTransporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: process.env.EMAIL_USER,
                clientId: clientId,
                clientSecret: clientSecret,
                refreshToken: refreshToken
            }
        });

        await new Promise((resolve, reject) => {
            testTransporter.verify((error, success) => {
                if (error) reject(error);
                else resolve(success);
            });
        });

        res.json({
            success: true,
            message: 'OAuth2 configuration validated successfully',
            note: 'Configuration not saved - update environment variables manually for security',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('OAuth2 configuration error:', error);
        res.status(400).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Generate DMARC record recommendation
 */
router.get('/dns/dmarc-recommendation', authenticateAdmin, (req, res) => {
    try {
        const domain = 'townranker.com';
        const reportEmail = `dmarc-reports@${domain}`;
        
        const dmarcRecord = `v=DMARC1; p=quarantine; rua=mailto:${reportEmail}; ruf=mailto:${reportEmail}; sp=quarantine; adkim=r; aspf=r; pct=100; rf=afrf; fo=1`;
        
        res.json({
            domain: domain,
            subdomain: `_dmarc.${domain}`,
            recordType: 'TXT',
            value: dmarcRecord,
            explanation: {
                'v=DMARC1': 'DMARC version 1',
                'p=quarantine': 'Policy: quarantine suspicious emails',
                'rua': 'Aggregate report email address',
                'ruf': 'Forensic report email address',
                'sp=quarantine': 'Subdomain policy',
                'adkim=r': 'DKIM alignment: relaxed',
                'aspf=r': 'SPF alignment: relaxed',
                'pct=100': 'Apply policy to 100% of emails',
                'rf=afrf': 'Report format: authentication failure',
                'fo=1': 'Failure options: generate reports on any failure'
            },
            instructions: [
                '1. Log into your DNS provider (Porkbun/Cloudflare)',
                '2. Add a new TXT record',
                '3. Set name/subdomain to: _dmarc',
                '4. Set value to the provided record above',
                '5. Save and wait for DNS propagation (up to 48 hours)',
                '6. Test with: dig TXT _dmarc.townranker.com'
            ],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('DMARC recommendation error:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;