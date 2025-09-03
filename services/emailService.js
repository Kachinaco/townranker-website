/**
 * Enhanced Email Service with Security, Rate Limiting, and Bounce Handling
 * TownRanker - Professional Email Management System
 */

const nodemailer = require('nodemailer');
const NodeCache = require('node-cache');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
    constructor() {
        // Rate limiting cache (10 minutes TTL)
        this.rateLimitCache = new NodeCache({ stdTTL: 600 });
        
        // Bounce tracking cache (24 hours TTL)
        this.bounceCache = new NodeCache({ stdTTL: 86400 });
        
        // Email verification cache (1 hour TTL)
        this.verificationCache = new NodeCache({ stdTTL: 3600 });
        
        // Load environment variables
        require('dotenv').config();
        
        // Initialize configuration
        this.config = {
            // Rate limiting
            maxEmailsPerHour: 50,
            maxEmailsPerMinute: 5,
            
            // Authentication
            service: process.env.EMAIL_SERVICE || 'gmail',
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
            from: process.env.EMAIL_FROM || '"TownRanker" <noreply@townranker.com>',
            
            // OAuth2 configuration (if available)
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
            accessToken: process.env.GOOGLE_ACCESS_TOKEN,
            
            // Security
            requireTLS: true,
            rejectUnauthorized: true,
            
            // Logging
            logPath: '/var/www/townranker.com/logs/email.log',
            logLevel: process.env.NODE_ENV === 'production' ? 'error' : 'debug'
        };
        
        this.transporter = null;
        this.isInitialized = false;
        
        // Initialize the service
        this.init();
    }

    /**
     * Initialize the email service with proper authentication
     */
    async init() {
        try {
            await this.createTransporter();
            await this.verifyConnection();
            this.isInitialized = true;
            console.log('✅ EmailService initialized successfully');
        } catch (error) {
            console.error('❌ EmailService initialization failed:', error.message);
            this.isInitialized = false;
        }
    }

    /**
     * Create email transporter with OAuth2 or App Password authentication
     */
    async createTransporter() {
        // Try OAuth2 first if credentials are available
        if (this.config.clientId && this.config.clientSecret && this.config.refreshToken) {
            console.log('🔐 Using OAuth2 authentication');
            this.transporter = nodemailer.createTransport({
                service: this.config.service,
                auth: {
                    type: 'OAuth2',
                    user: this.config.user,
                    clientId: this.config.clientId,
                    clientSecret: this.config.clientSecret,
                    refreshToken: this.config.refreshToken,
                    accessToken: this.config.accessToken
                },
                secure: true,
                requireTLS: this.config.requireTLS,
                tls: {
                    rejectUnauthorized: this.config.rejectUnauthorized
                }
            });
        } else if (this.config.user && this.config.pass) {
            // Fallback to App Password authentication
            console.log('🔑 Using App Password authentication');
            this.transporter = nodemailer.createTransport({
                service: this.config.service,
                auth: {
                    user: this.config.user,
                    pass: this.config.pass
                },
                secure: true,
                requireTLS: this.config.requireTLS,
                tls: {
                    rejectUnauthorized: this.config.rejectUnauthorized
                }
            });
        } else {
            throw new Error('No valid email authentication credentials found');
        }
    }

    /**
     * Verify email connection
     */
    async verifyConnection() {
        if (!this.transporter) {
            throw new Error('Email transporter not initialized');
        }

        return new Promise((resolve, reject) => {
            this.transporter.verify((error, success) => {
                if (error) {
                    console.error('❌ Email verification failed:', error.message);
                    reject(error);
                } else {
                    console.log('✅ Email server connection verified');
                    resolve(success);
                }
            });
        });
    }

    /**
     * Check rate limits for email sending
     */
    checkRateLimit(identifier = 'global') {
        const hourKey = `hour_${identifier}_${Math.floor(Date.now() / (60 * 60 * 1000))}`;
        const minuteKey = `minute_${identifier}_${Math.floor(Date.now() / (60 * 1000))}`;
        
        const hourCount = this.rateLimitCache.get(hourKey) || 0;
        const minuteCount = this.rateLimitCache.get(minuteKey) || 0;
        
        if (hourCount >= this.config.maxEmailsPerHour) {
            throw new Error(`Rate limit exceeded: Maximum ${this.config.maxEmailsPerHour} emails per hour`);
        }
        
        if (minuteCount >= this.config.maxEmailsPerMinute) {
            throw new Error(`Rate limit exceeded: Maximum ${this.config.maxEmailsPerMinute} emails per minute`);
        }
        
        // Increment counters
        this.rateLimitCache.set(hourKey, hourCount + 1, 3600); // 1 hour TTL
        this.rateLimitCache.set(minuteKey, minuteCount + 1, 60); // 1 minute TTL
        
        return {
            hourlyUsed: hourCount + 1,
            hourlyLimit: this.config.maxEmailsPerHour,
            minutelyUsed: minuteCount + 1,
            minutelyLimit: this.config.maxEmailsPerMinute
        };
    }

    /**
     * Check if email address has bounced recently
     */
    checkBounceStatus(email) {
        const bounceData = this.bounceCache.get(email);
        if (bounceData && bounceData.count >= 3) {
            throw new Error(`Email address ${email} has exceeded bounce limit (${bounceData.count} bounces)`);
        }
        return bounceData;
    }

    /**
     * Record email bounce
     */
    recordBounce(email, reason = 'unknown') {
        const existing = this.bounceCache.get(email) || { count: 0, reasons: [] };
        existing.count++;
        existing.reasons.push({
            reason,
            timestamp: new Date().toISOString()
        });
        existing.lastBounce = new Date().toISOString();
        
        this.bounceCache.set(email, existing);
        console.warn(`⚠️ Email bounce recorded for ${email}: ${reason} (count: ${existing.count})`);
        
        return existing;
    }

    /**
     * Validate email address format and domain
     */
    async validateEmail(email) {
        // Basic format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Invalid email format');
        }

        // Check cache first
        const cached = this.verificationCache.get(email);
        if (cached !== undefined) {
            return cached;
        }

        // For now, we'll just validate format and cache the result
        // In a production environment, you might want to add DNS MX record checking
        const isValid = emailRegex.test(email) && email.length <= 254;
        this.verificationCache.set(email, isValid);
        
        return isValid;
    }

    /**
     * Add tracking pixel to HTML content
     */
    addTrackingPixel(html, trackingId) {
        const trackingUrl = `${process.env.BASE_URL || 'https://townranker.com'}/api/track-email-open/${trackingId}`;
        const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none;" alt="">`;
        
        // Insert before closing body tag, or at the end if no body tag
        if (html.includes('</body>')) {
            return html.replace('</body>', `${trackingPixel}</body>`);
        } else {
            return html + trackingPixel;
        }
    }

    /**
     * Add click tracking to links
     */
    addClickTracking(html, trackingId) {
        const baseUrl = process.env.BASE_URL || 'https://townranker.com';
        
        // Replace links with tracking URLs
        return html.replace(
            /<a\s+([^>]*href=["']?)([^"'>\s]+)(["']?[^>]*)>/gi,
            (match, prefix, url, suffix) => {
                // Skip if it's already a tracking URL or an internal anchor
                if (url.startsWith('#') || url.includes('/api/crm/emails/track/')) {
                    return match;
                }
                
                const trackingUrl = `${baseUrl}/api/crm/emails/track/${trackingId}/click?url=${encodeURIComponent(url)}`;
                return `<a ${prefix}${trackingUrl}${suffix}>`;
            }
        );
    }

    /**
     * Log email activity
     */
    async logEmailActivity(data) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                ...data
            };
            
            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(this.config.logPath, logLine);
        } catch (error) {
            console.error('Failed to log email activity:', error.message);
        }
    }

    /**
     * Send email with comprehensive error handling and tracking
     */
    async sendEmail(emailOptions) {
        if (!this.isInitialized) {
            throw new Error('EmailService not initialized');
        }

        const startTime = Date.now();
        let success = false;
        let error = null;

        try {
            // Validate inputs
            if (!emailOptions.to) {
                throw new Error('Recipient email is required');
            }
            
            if (!emailOptions.subject && !emailOptions.html && !emailOptions.text) {
                throw new Error('Email subject or content is required');
            }

            // Validate email address
            await this.validateEmail(emailOptions.to);

            // Check bounce status
            this.checkBounceStatus(emailOptions.to);

            // Check rate limits
            const rateLimitStatus = this.checkRateLimit(emailOptions.to);

            // Prepare email data
            const emailData = {
                from: emailOptions.from || this.config.from,
                to: emailOptions.to,
                subject: emailOptions.subject,
                text: emailOptions.text,
                html: emailOptions.html,
                attachments: emailOptions.attachments,
                replyTo: emailOptions.replyTo,
                headers: emailOptions.headers || {}
            };

            // Add tracking if HTML content exists and tracking is enabled
            if (emailData.html && emailOptions.enableTracking !== false) {
                const trackingId = emailOptions.trackingId || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                emailData.html = this.addTrackingPixel(emailData.html, trackingId);
                emailData.html = this.addClickTracking(emailData.html, trackingId);
                emailData.headers['X-Tracking-ID'] = trackingId;
            }

            // Send email
            const result = await this.transporter.sendMail(emailData);
            
            success = true;
            
            // Log successful send
            await this.logEmailActivity({
                action: 'send',
                status: 'success',
                to: emailOptions.to,
                subject: emailOptions.subject,
                messageId: result.messageId,
                duration: Date.now() - startTime,
                rateLimitStatus
            });

            console.log(`✅ Email sent successfully to ${emailOptions.to} (${result.messageId})`);
            
            return {
                success: true,
                messageId: result.messageId,
                rateLimitStatus,
                response: result.response
            };

        } catch (err) {
            error = err;
            success = false;

            // Handle specific error types
            if (err.responseCode === 550 || err.message.includes('bounce')) {
                this.recordBounce(emailOptions.to, err.message);
            }

            // Log failed send
            await this.logEmailActivity({
                action: 'send',
                status: 'error',
                to: emailOptions.to,
                subject: emailOptions.subject,
                error: err.message,
                duration: Date.now() - startTime
            });

            console.error(`❌ Failed to send email to ${emailOptions.to}:`, err.message);
            
            throw err;
        }
    }

    /**
     * Get rate limit status for an identifier
     */
    getRateLimitStatus(identifier = 'global') {
        const hourKey = `hour_${identifier}_${Math.floor(Date.now() / (60 * 60 * 1000))}`;
        const minuteKey = `minute_${identifier}_${Math.floor(Date.now() / (60 * 1000))}`;
        
        const hourCount = this.rateLimitCache.get(hourKey) || 0;
        const minuteCount = this.rateLimitCache.get(minuteKey) || 0;
        
        return {
            hourlyUsed: hourCount,
            hourlyLimit: this.config.maxEmailsPerHour,
            hourlyRemaining: Math.max(0, this.config.maxEmailsPerHour - hourCount),
            minutelyUsed: minuteCount,
            minutelyLimit: this.config.maxEmailsPerMinute,
            minutelyRemaining: Math.max(0, this.config.maxEmailsPerMinute - minuteCount)
        };
    }

    /**
     * Get bounce statistics
     */
    getBounceStats() {
        const keys = this.bounceCache.keys();
        const stats = {
            totalBouncedEmails: keys.length,
            bounces: []
        };

        keys.forEach(email => {
            const data = this.bounceCache.get(email);
            stats.bounces.push({
                email,
                count: data.count,
                lastBounce: data.lastBounce,
                reasons: data.reasons
            });
        });

        return stats;
    }

    /**
     * Clear bounce record for an email (admin function)
     */
    clearBounceRecord(email) {
        this.bounceCache.del(email);
        console.log(`✅ Cleared bounce record for ${email}`);
    }

    /**
     * Test email configuration
     */
    async testConfiguration() {
        try {
            await this.verifyConnection();
            
            const testResult = {
                connection: 'success',
                authentication: 'verified',
                service: this.config.service,
                user: this.config.user,
                rateLimits: this.getRateLimitStatus(),
                timestamp: new Date().toISOString()
            };

            return testResult;
        } catch (error) {
            throw {
                connection: 'failed',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get service health status
     */
    getHealthStatus() {
        return {
            initialized: this.isInitialized,
            authenticated: !!this.transporter,
            service: this.config.service,
            user: this.config.user,
            hasOAuth2: !!(this.config.clientId && this.config.clientSecret),
            rateLimits: this.getRateLimitStatus(),
            bounceStats: this.getBounceStats(),
            cacheStats: {
                rateLimitEntries: this.rateLimitCache.keys().length,
                bounceEntries: this.bounceCache.keys().length,
                verificationEntries: this.verificationCache.keys().length
            }
        };
    }
}

// Create and export singleton instance
const emailService = new EmailService();

module.exports = emailService;