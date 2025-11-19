const rateLimit = require('express-rate-limit');
const axios = require('axios');

/**
 * Comprehensive Anti-Spam Middleware for TownRanker Lead Forms
 * Includes: Rate Limiting, reCAPTCHA v3, Honeypot Detection, Pattern Analysis, Slack Notifications
 */

/**
 * Send Slack notification when spam is blocked
 */
async function notifySlackSpamBlocked(reason, formData, clientIp, details = {}) {
    const webhookUrl = process.env.SLACK_WEBHOOK_LEADS;

    if (!webhookUrl) {
        console.log('⚠️  Slack webhook not configured - skipping spam notification');
        return;
    }

    // Create emoji based on reason
    const reasonEmojis = {
        'honeypot': '🍯',
        'timing': '⚡',
        'recaptcha': '🤖',
        'recaptcha_score': '📊',
        'spam_patterns': '🚫',
        'rate_limit': '🚨'
    };

    const emoji = reasonEmojis[reason] || '🛡️';

    // Format spam indicators for display
    let indicatorsText = 'None';
    if (details.indicators && details.indicators.length > 0) {
        indicatorsText = details.indicators.map(ind => `• ${ind.replace(/_/g, ' ')}`).join('\n');
    }

    const payload = {
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: `${emoji} Spam Bot Blocked!`,
                    emoji: true
                }
            },
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text: `*Blocked Reason:*\n${reason.toUpperCase().replace(/_/g, ' ')}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*IP Address:*\n${clientIp || 'Unknown'}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Name Submitted:*\n${formData.name || 'N/A'}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Email Submitted:*\n${formData.email || 'N/A'}`
                    }
                ]
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Message:*\n${formData.message ? formData.message.substring(0, 200) : 'N/A'}`
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Spam Indicators:*\n${indicatorsText}`
                }
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: `✅ *No Action Needed* - Automatically blocked by bot protection | Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' })} MST`
                    }
                ]
            }
        ]
    };

    try {
        await axios.post(webhookUrl, payload);
        console.log('✅ Spam notification sent to Slack');
    } catch (error) {
        console.error('❌ Failed to send Slack spam notification:', error.message);
    }
}

// Rate limiting by IP - Allow max 3 submissions per hour per IP
const formRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // limit each IP to 3 requests per windowMs
    message: {
        success: false,
        error: 'Too many submissions. Please try again later.',
        rateLimited: true
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip successful requests from rate limit tracking
    skipSuccessfulRequests: false,
    // Store in memory (consider Redis for production scaling)
    handler: (req, res) => {
        console.log(`🚫 Rate limit exceeded for IP: ${req.ip}`);

        // Send Slack notification for rate limit
        notifySlackSpamBlocked('rate_limit', req.body || {}, req.ip, {
            indicators: ['Too many submissions from same IP']
        }).catch(err => console.error('Slack notification error:', err));

        res.status(429).json({
            success: false,
            error: 'Too many form submissions. Please try again in an hour.',
            rateLimited: true
        });
    }
});

// Global rate limiter for all API endpoints - prevent DDoS
const globalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { success: false, error: 'Too many requests from this IP' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Verify Google reCAPTCHA v3 token
 */
async function verifyRecaptcha(token, remoteIp) {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;

    // Skip reCAPTCHA if not configured (development mode)
    if (!secretKey || secretKey === 'your_recaptcha_secret_key_here') {
        console.log('⚠️  reCAPTCHA not configured - skipping verification');
        return { success: true, score: 1.0, skipped: true };
    }

    try {
        const response = await axios.post('https://www.google.com/recaptcha/api/siteverify', null, {
            params: {
                secret: secretKey,
                response: token,
                remoteip: remoteIp
            }
        });

        const { success, score, 'error-codes': errorCodes } = response.data;

        if (!success) {
            console.log('❌ reCAPTCHA verification failed:', errorCodes);
            return { success: false, score: 0, errors: errorCodes };
        }

        console.log(`✅ reCAPTCHA verified - Score: ${score}`);
        return { success: true, score, data: response.data };

    } catch (error) {
        console.error('❌ reCAPTCHA verification error:', error.message);
        // In production, you might want to fail closed (reject the submission)
        // For now, we'll log but allow submission
        return { success: true, score: 0.5, error: error.message, fallback: true };
    }
}

/**
 * Detect spam patterns in form data
 */
function detectSpamPatterns(data) {
    const spamIndicators = [];
    const { name = '', email = '', message = '', phone, company } = data;

    // 1. Check for random character strings (like "RhzetQAUFYDdCDlvZe")
    const randomStringPattern = /^[A-Za-z]{15,}$/;
    if (name && randomStringPattern.test(name)) {
        spamIndicators.push('name_looks_random');
    }
    if (message && randomStringPattern.test(message)) {
        spamIndicators.push('message_looks_random');
    }

    // 2. Check for excessive capitals or numbers
    const excessiveCapsPattern = /[A-Z]{10,}/;
    if ((name && excessiveCapsPattern.test(name)) || (message && excessiveCapsPattern.test(message))) {
        spamIndicators.push('excessive_capitals');
    }

    // 3. Check for URL spam
    const urlPattern = /(https?:\/\/|www\.)/i;
    if ((message && urlPattern.test(message)) || (name && urlPattern.test(name))) {
        spamIndicators.push('contains_urls');
    }

    // 4. Check for common spam keywords
    const spamKeywords = ['viagra', 'cialis', 'crypto', 'bitcoin', 'lottery', 'winner', 'casino', 'poker'];
    const contentLower = `${name || ''} ${message || ''} ${email || ''}`.toLowerCase();
    const foundSpamKeywords = spamKeywords.filter(keyword => contentLower.includes(keyword));
    if (foundSpamKeywords.length > 0) {
        spamIndicators.push('spam_keywords');
    }

    // 5. Check for suspicious email patterns
    const suspiciousEmailPattern = /[0-9]{6,}@|temp|trash|fake|spam/i;
    if (email && suspiciousEmailPattern.test(email)) {
        spamIndicators.push('suspicious_email');
    }

    // 6. Check if message is too short or missing
    if (!message || message.trim().length < 10) {
        spamIndicators.push('message_too_short');
    }

    // 7. Check if all fields look like random strings
    const allFieldsRandom = [name, email, message].every(field =>
        field && /^[A-Za-z]{10,}$/.test(field)
    );
    if (allFieldsRandom) {
        spamIndicators.push('all_fields_random');
    }

    // 8. Check for missing required human-like patterns
    const hasNoSpaces = name && name.length > 15 && !name.includes(' ');
    if (hasNoSpaces) {
        spamIndicators.push('name_no_spaces');
    }

    return {
        isSpam: spamIndicators.length >= 2, // 2 or more indicators = likely spam
        indicators: spamIndicators,
        score: spamIndicators.length
    };
}

/**
 * Check honeypot field
 * Bots will fill this field, humans won't see it
 */
function checkHoneypot(honeypotValue) {
    if (honeypotValue && honeypotValue.trim() !== '') {
        console.log('🍯 Honeypot triggered - Bot detected!');
        return true; // Bot detected
    }
    return false;
}

/**
 * Check submission timing
 * Bots submit too fast, humans take time to fill forms
 */
function checkSubmissionTiming(timestamp) {
    if (!timestamp) return { suspicious: false };

    try {
        const submittedTime = new Date(timestamp);
        const now = new Date();
        const timeDiff = (now - submittedTime) / 1000; // seconds

        // If form was submitted in less than 3 seconds, very suspicious
        if (timeDiff < 3) {
            console.log(`⚡ Form submitted too fast: ${timeDiff}s`);
            return { suspicious: true, reason: 'too_fast', seconds: timeDiff };
        }

        // If timestamp is in the future, invalid
        if (timeDiff < 0) {
            console.log(`⏰ Invalid timestamp - future time`);
            return { suspicious: true, reason: 'invalid_timestamp' };
        }

        // If form was open for more than 1 hour, might be a stale tab or bot
        if (timeDiff > 3600) {
            console.log(`⏰ Form open for too long: ${timeDiff}s`);
            return { suspicious: true, reason: 'stale_submission', seconds: timeDiff };
        }

        return { suspicious: false, seconds: timeDiff };
    } catch (error) {
        return { suspicious: false, error: error.message };
    }
}

/**
 * Comprehensive anti-spam middleware
 */
async function antiSpamMiddleware(req, res, next) {
    console.log('\n🛡️  Running anti-spam checks...');

    const {
        recaptchaToken,
        honeypot,
        website,
        timestamp,
        ...formData
    } = req.body;

    const clientIp = req.ip || req.connection.remoteAddress;
    const spamChecks = {
        passed: [],
        failed: [],
        warnings: []
    };

    // 1. Check Honeypot
    if (checkHoneypot(honeypot) || checkHoneypot(website)) {
        spamChecks.failed.push('honeypot');
        console.log('🚫 SPAM DETECTED: Honeypot triggered');

        // Send Slack notification
        await notifySlackSpamBlocked('honeypot', formData, clientIp, {
            indicators: ['Bot filled hidden honeypot field']
        });

        return res.status(400).json({
            success: false,
            error: 'Invalid submission detected',
            code: 'SPAM_DETECTED'
        });
    }
    spamChecks.passed.push('honeypot');

    // 2. Check submission timing
    const timingCheck = checkSubmissionTiming(timestamp);
    if (timingCheck.suspicious && timingCheck.reason === 'too_fast') {
        spamChecks.failed.push('timing');
        console.log('🚫 SPAM DETECTED: Form submitted too quickly');

        // Send Slack notification
        await notifySlackSpamBlocked('timing', formData, clientIp, {
            indicators: [`Form submitted in ${timingCheck.seconds?.toFixed(2) || '?'} seconds (minimum 3 seconds required)`]
        });

        return res.status(400).json({
            success: false,
            error: 'Please take your time filling out the form',
            code: 'TOO_FAST'
        });
    }
    if (timingCheck.suspicious) {
        spamChecks.warnings.push(`timing_${timingCheck.reason}`);
    } else {
        spamChecks.passed.push('timing');
    }

    // 3. Verify reCAPTCHA
    if (recaptchaToken) {
        const recaptchaResult = await verifyRecaptcha(recaptchaToken, clientIp);

        if (!recaptchaResult.success && !recaptchaResult.skipped && !recaptchaResult.fallback) {
            spamChecks.failed.push('recaptcha');
            console.log('🚫 SPAM DETECTED: reCAPTCHA failed');

            // Send Slack notification
            await notifySlackSpamBlocked('recaptcha', formData, clientIp, {
                indicators: ['reCAPTCHA verification failed']
            });

            return res.status(400).json({
                success: false,
                error: 'reCAPTCHA verification failed. Please try again.',
                code: 'RECAPTCHA_FAILED'
            });
        }

        // Check reCAPTCHA score (v3 gives scores 0.0 - 1.0, where 1.0 is very likely human)
        if (recaptchaResult.score && recaptchaResult.score < 0.5) {
            spamChecks.failed.push('recaptcha_score');
            console.log(`🚫 SPAM DETECTED: reCAPTCHA score too low (${recaptchaResult.score})`);

            // Send Slack notification
            await notifySlackSpamBlocked('recaptcha_score', formData, clientIp, {
                indicators: [`reCAPTCHA score: ${recaptchaResult.score} (below 0.5 threshold)`]
            });

            return res.status(400).json({
                success: false,
                error: 'Suspicious activity detected. Please contact us directly.',
                code: 'LOW_RECAPTCHA_SCORE'
            });
        }

        spamChecks.passed.push('recaptcha');
        req.recaptchaScore = recaptchaResult.score;
    }

    // 4. Detect spam patterns
    const spamDetection = detectSpamPatterns(formData);
    if (spamDetection.isSpam) {
        spamChecks.failed.push('spam_patterns');
        console.log('🚫 SPAM DETECTED: Spam patterns found:', spamDetection.indicators);

        // Send Slack notification
        await notifySlackSpamBlocked('spam_patterns', formData, clientIp, {
            indicators: spamDetection.indicators
        });

        return res.status(400).json({
            success: false,
            error: 'Your submission appears to contain invalid data. Please fill out the form correctly.',
            code: 'SPAM_PATTERNS',
            indicators: spamDetection.indicators
        });
    }
    if (spamDetection.score > 0) {
        spamChecks.warnings.push(`patterns_${spamDetection.score}`);
    } else {
        spamChecks.passed.push('spam_patterns');
    }

    // Log results
    console.log('✅ Anti-spam checks passed:', spamChecks.passed);
    if (spamChecks.warnings.length > 0) {
        console.log('⚠️  Warnings:', spamChecks.warnings);
    }

    // Attach spam check results to request for logging
    req.spamChecks = spamChecks;

    // Continue to next middleware
    next();
}

module.exports = {
    formRateLimiter,
    globalApiLimiter,
    antiSpamMiddleware,
    verifyRecaptcha,
    detectSpamPatterns,
    checkHoneypot
};
