// Bot Protection Middleware for TownRanker
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

// List of known bad bots
const badBots = [
    // Aggressive crawlers
    'ahrefsbot', 'mj12bot', 'semrushbot', 'dotbot', 'rogerbot',
    'sistrix', 'wasalive-bot', 'siteexplorer', 'majestic',

    // SEO/Marketing bots
    'serpstatbot', 'seokicks-robot', 'searchmetricsbot',
    'seoscanners', 'backlinkcrawler',

    // Malicious bots
    'nikto', 'sqlmap', 'masscan', 'nmap', 'dirbuster',
    'nessus', 'openvas', 'jorgee', 'proxychecker', 'typhoeus',

    // Scrapers
    'scrapy', 'python-requests', 'python-urllib', 'go-http-client',

    // Vulnerability scanners
    'zgrab', 'netsystemsresearch', 'researchscan', 'censys', 'shodan',

    // Generic patterns
    'bot[\\s\\-_.]', 'crawler', 'spider', 'scraper', 'scan', 'hack'
];

// Good bots that should be allowed
const goodBots = [
    'googlebot', 'bingbot', 'slurp', 'duckduckbot',
    'facebookexternalhit', 'twitterbot', 'linkedinbot',
    'whatsapp', 'telegrambot', 'discordbot', 'slackbot',
    'uptimerobot', 'pingdom', 'statuscake', 'cloudflare'
];

// Check if user agent is a bad bot
const isBadBot = (userAgent) => {
    if (!userAgent) return true;
    const ua = userAgent.toLowerCase();

    // Check for bad bots
    for (const bot of badBots) {
        if (new RegExp(bot, 'i').test(ua)) {
            return true;
        }
    }

    // Check for empty or suspicious user agents
    if (ua === '' || ua === '-' || ua.length < 10) {
        return true;
    }

    return false;
};

// Check if user agent is a good bot
const isGoodBot = (userAgent) => {
    if (!userAgent) return false;
    const ua = userAgent.toLowerCase();

    for (const bot of goodBots) {
        if (ua.includes(bot)) {
            return true;
        }
    }

    return false;
};

// Bot detection middleware
const botDetection = (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection.remoteAddress;

    // Block bad bots
    if (isBadBot(userAgent)) {
        console.log(`[BOT BLOCKED] IP: ${ip}, UA: ${userAgent}`);
        return res.status(444).end(); // Close connection without response
    }

    // Mark good bots
    if (isGoodBot(userAgent)) {
        req.isGoodBot = true;
    }

    // Check for suspicious patterns in request
    const suspiciousPatterns = [
        /\.\.(\/|\\)/,  // Directory traversal
        /\<script/i,    // Script injection
        /javascript:/i, // JavaScript protocol
        /on\w+=/i,      // Event handlers
        /base64_/i,     // Base64 encoding
        /union.*select/i, // SQL injection
        /exec\(/i,      // Command execution
        /eval\(/i       // Code evaluation
    ];

    const url = req.originalUrl || req.url;
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(url)) {
            console.log(`[SUSPICIOUS REQUEST BLOCKED] IP: ${ip}, URL: ${url}`);
            return res.status(444).end();
        }
    }

    next();
};

// Rate limiting for general requests
const generalLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 10, // 10 requests per second
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.isGoodBot === true
});

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 5, // 5 requests per second
    message: 'API rate limit exceeded.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.isGoodBot === true
});

// Rate limiting for login attempts
const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 3, // 3 attempts per minute
    skipSuccessfulRequests: true,
    message: 'Too many login attempts, please try again later.'
});

// Slow down repeated requests
const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 100, // Allow 100 requests per 15 minutes at full speed
    delayMs: 500, // Add 500ms delay per request after delayAfter
    maxDelayMs: 20000, // Maximum delay of 20 seconds
    skip: (req) => req.isGoodBot === true
});

// Honeypot endpoints to catch bots
const honeypot = (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    console.log(`[HONEYPOT TRIGGERED] IP: ${ip}, UA: ${userAgent}, Path: ${req.path}`);

    // Add IP to blacklist (you can implement persistent storage)
    // For now, just block the connection
    res.status(444).end();
};

// Track request patterns for anomaly detection
const requestTracker = {};
const anomalyDetection = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!requestTracker[ip]) {
        requestTracker[ip] = {
            requests: [],
            blocked: false
        };
    }

    const tracker = requestTracker[ip];

    // Remove old requests (older than 1 minute)
    tracker.requests = tracker.requests.filter(time => now - time < 60000);

    // Add current request
    tracker.requests.push(now);

    // Check for anomalies
    if (tracker.requests.length > 100) { // More than 100 requests per minute
        tracker.blocked = true;
        console.log(`[ANOMALY DETECTED] IP: ${ip}, Requests: ${tracker.requests.length}/min`);
        return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    // Check request patterns (e.g., scanning behavior)
    const paths = [];
    if (req.path) {
        paths.push(req.path);

        // Detect scanning patterns
        const scanPatterns = [
            'admin', 'wp-admin', 'phpmyadmin', '.php', '.asp',
            'backup', 'sql', 'database', 'config', '.git'
        ];

        for (const pattern of scanPatterns) {
            if (req.path.toLowerCase().includes(pattern)) {
                console.log(`[SCAN DETECTED] IP: ${ip}, Path: ${req.path}`);
                return res.status(444).end();
            }
        }
    }

    next();
};

// Clean up tracking data periodically
setInterval(() => {
    const now = Date.now();
    for (const ip in requestTracker) {
        const tracker = requestTracker[ip];
        tracker.requests = tracker.requests.filter(time => now - time < 60000);

        // Remove IP if no recent requests
        if (tracker.requests.length === 0) {
            delete requestTracker[ip];
        }
    }
}, 60000); // Clean up every minute

module.exports = {
    botDetection,
    generalLimiter,
    apiLimiter,
    loginLimiter,
    speedLimiter,
    honeypot,
    anomalyDetection,
    isBadBot,
    isGoodBot
};