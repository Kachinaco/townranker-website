/**
 * Security Integration Middleware for TownRanker
 * 
 * Integrates all security measures:
 * - XSS Protection
 * - CSRF Protection
 * - NoSQL Injection Prevention
 * - Session Security
 * - Rate Limiting
 * - Security Headers
 */

const CSRFProtection = require('./csrf');
const XSSProtection = require('./xss-protection');
const SessionSecurity = require('./session-security');
const ValidationMiddleware = require('./validation');

class SecurityIntegration {
    constructor(options = {}) {
        // Initialize security modules
        this.csrf = new CSRFProtection({
            secret: options.csrfSecret || process.env.CSRF_SECRET,
            secure: process.env.NODE_ENV === 'production',
            ...options.csrf
        });

        this.xss = new XSSProtection({
            strictMode: process.env.NODE_ENV === 'production',
            ...options.xss
        });

        this.session = new SessionSecurity({
            secret: options.sessionSecret || process.env.JWT_SECRET,
            ipCheck: process.env.NODE_ENV === 'production',
            userAgentCheck: process.env.NODE_ENV === 'production',
            ...options.session
        });

        // Security headers configuration
        this.securityHeaders = {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
            ...options.headers
        };

        // Rate limiting configuration
        this.rateLimitConfig = {
            windowMs: 15 * 60 * 1000, // 15 minutes
            maxRequests: 100,
            skipSuccessfulRequests: false,
            ...options.rateLimit
        };
    }

    /**
     * Apply all security headers
     */
    applySecurityHeaders() {
        return (req, res, next) => {
            // Apply custom security headers
            Object.entries(this.securityHeaders).forEach(([header, value]) => {
                res.setHeader(header, value);
            });

            // Dynamic CSP based on environment
            const csp = this.buildCSPHeader(req);
            res.setHeader('Content-Security-Policy', csp);

            // Remove sensitive headers
            res.removeHeader('X-Powered-By');
            res.removeHeader('Server');

            next();
        };
    }

    /**
     * Build dynamic Content Security Policy
     */
    buildCSPHeader(req) {
        const isProduction = process.env.NODE_ENV === 'production';
        const baseDirectives = {
            'default-src': ["'self'"],
            'script-src': [
                "'self'",
                isProduction ? '' : "'unsafe-inline'",
                isProduction ? '' : "'unsafe-eval'",
                'https://apis.google.com',
                'https://www.gstatic.com',
                'https://accounts.google.com',
                'https://maps.googleapis.com'
            ].filter(Boolean),
            'style-src': [
                "'self'",
                "'unsafe-inline'",
                'https://fonts.googleapis.com',
                'https://accounts.google.com'
            ],
            'font-src': [
                "'self'",
                'https://fonts.gstatic.com'
            ],
            'img-src': [
                "'self'",
                'data:',
                'https:',
                'blob:'
            ],
            'connect-src': [
                "'self'",
                'https://accounts.google.com',
                'https://www.googleapis.com'
            ],
            'frame-src': [
                "'self'",
                'https://accounts.google.com'
            ],
            'object-src': ["'none'"],
            'base-uri': ["'self'"],
            'form-action': ["'self'"],
            'frame-ancestors': ["'self'"],
            'media-src': ["'self'"],
            'worker-src': ["'self'"]
        };

        if (isProduction) {
            baseDirectives['upgrade-insecure-requests'] = [];
            baseDirectives['block-all-mixed-content'] = [];
        }

        // Convert to CSP string
        return Object.entries(baseDirectives)
            .map(([directive, sources]) => {
                if (sources.length === 0) return directive;
                return `${directive} ${sources.join(' ')}`;
            })
            .join('; ');
    }

    /**
     * Global error handler for security-related errors
     */
    securityErrorHandler() {
        return (error, req, res, next) => {
            // Log security errors
            if (error.name === 'ValidationError' || 
                error.message.includes('CSRF') || 
                error.message.includes('XSS') ||
                error.message.includes('injection')) {
                console.error('Security Error:', {
                    error: error.message,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    path: req.path,
                    method: req.method,
                    timestamp: new Date().toISOString()
                });

                // Don't expose detailed error information
                return res.status(400).json({
                    success: false,
                    message: 'Invalid request format',
                    error: 'SECURITY_ERROR'
                });
            }

            next(error);
        };
    }

    /**
     * Request logging and monitoring
     */
    securityLogging() {
        return (req, res, next) => {
            const startTime = Date.now();

            // Log suspicious patterns
            const suspiciousPatterns = [
                /\.\.\//,  // Directory traversal
                /<script/i, // Script injection
                /javascript:/i, // JavaScript protocol
                /vbscript:/i, // VBScript protocol
                /data:text\/html/i, // Data URL with HTML
                /\$\w+/, // MongoDB operators
                /union\s+select/i, // SQL injection
                /drop\s+table/i, // SQL injection
                /exec\s*\(/i, // Code execution
                /eval\s*\(/i, // Code evaluation
            ];

            const requestUrl = req.originalUrl || req.url;
            const requestBody = JSON.stringify(req.body || {});
            const userAgent = req.get('User-Agent') || '';

            const isSuspicious = suspiciousPatterns.some(pattern => 
                pattern.test(requestUrl) || 
                pattern.test(requestBody) || 
                pattern.test(userAgent)
            );

            if (isSuspicious) {
                console.warn('Suspicious Request:', {
                    ip: req.ip,
                    method: req.method,
                    url: requestUrl,
                    userAgent,
                    body: req.body,
                    timestamp: new Date().toISOString()
                });
            }

            // Log response time on finish
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                if (duration > 5000) { // Log slow requests
                    console.warn('Slow Request:', {
                        method: req.method,
                        url: requestUrl,
                        duration: `${duration}ms`,
                        statusCode: res.statusCode
                    });
                }
            });

            next();
        };
    }

    /**
     * IP-based rate limiting
     */
    ipRateLimit() {
        const requestCounts = new Map();
        
        return (req, res, next) => {
            const clientIp = req.ip || req.connection.remoteAddress;
            const now = Date.now();
            const windowStart = now - this.rateLimitConfig.windowMs;
            const key = `${clientIp}:${Math.floor(now / this.rateLimitConfig.windowMs)}`;

            // Clean old entries
            for (const [k, data] of requestCounts) {
                if (data.timestamp < windowStart) {
                    requestCounts.delete(k);
                }
            }

            const requestData = requestCounts.get(key) || { count: 0, timestamp: now };
            
            if (requestData.count >= this.rateLimitConfig.maxRequests) {
                return res.status(429).json({
                    success: false,
                    message: 'Too many requests from this IP',
                    error: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: Math.ceil(this.rateLimitConfig.windowMs / 1000)
                });
            }

            requestData.count++;
            requestData.timestamp = now;
            requestCounts.set(key, requestData);

            // Add rate limit headers
            res.setHeader('X-RateLimit-Limit', this.rateLimitConfig.maxRequests);
            res.setHeader('X-RateLimit-Remaining', this.rateLimitConfig.maxRequests - requestData.count);
            res.setHeader('X-RateLimit-Reset', new Date(now + this.rateLimitConfig.windowMs).toISOString());

            next();
        };
    }

    /**
     * Complete security middleware stack
     */
    getSecurityStack() {
        return [
            // 1. Security headers
            this.applySecurityHeaders(),
            
            // 2. Request logging
            this.securityLogging(),
            
            // 3. IP rate limiting
            this.ipRateLimit(),
            
            // 4. XSS protection
            this.xss.setCSPHeaders.bind(this.xss),
            
            // 5. Input sanitization
            this.xss.sanitizeInput(),
            ValidationMiddleware.sanitizeBody,
            
            // 6. CSRF protection (for state-changing requests)
            this.csrf.protect(),
            
            // 7. Output sanitization
            this.xss.sanitizeOutput(),
            
            // 8. Error handling
            this.securityErrorHandler()
        ];
    }

    /**
     * Authentication middleware with security enhancements
     */
    authenticate() {
        return this.session.authenticate();
    }

    /**
     * Admin-only middleware with additional security
     */
    requireAdmin() {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required',
                    error: 'NOT_AUTHENTICATED'
                });
            }

            if (req.user.role !== 'admin') {
                // Log unauthorized admin access attempts
                console.warn('Unauthorized admin access attempt:', {
                    userId: req.user.id,
                    userEmail: req.user.email,
                    userRole: req.user.role,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    path: req.path,
                    timestamp: new Date().toISOString()
                });

                return res.status(403).json({
                    success: false,
                    message: 'Admin access required',
                    error: 'INSUFFICIENT_PRIVILEGES'
                });
            }

            next();
        };
    }

    /**
     * Get security status and statistics
     */
    getSecurityStatus() {
        return {
            csrf: {
                enabled: true,
                cookieName: this.csrf.cookieName,
                headerName: this.csrf.headerName
            },
            xss: {
                enabled: true,
                strictMode: this.xss.strictMode
            },
            session: this.session.getSessionStats(),
            rateLimit: {
                windowMs: this.rateLimitConfig.windowMs,
                maxRequests: this.rateLimitConfig.maxRequests
            },
            environment: process.env.NODE_ENV,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = SecurityIntegration;