/**
 * CSRF Protection Middleware for TownRanker
 * 
 * Implements Cross-Site Request Forgery protection with:
 * - Secure token generation and validation
 * - Double submit cookie pattern
 * - SameSite cookie attributes
 * - Origin and Referer header validation
 */

const crypto = require('crypto');

class CSRFProtection {
    constructor(options = {}) {
        this.secret = options.secret || process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
        this.tokenLength = options.tokenLength || 32;
        this.cookieName = options.cookieName || '_csrfToken';
        this.headerName = options.headerName || 'x-csrf-token';
        this.ignoreMethods = options.ignoreMethods || ['GET', 'HEAD', 'OPTIONS'];
        this.secure = options.secure !== false; // Default to true
        this.sameSite = options.sameSite || 'strict';
        this.httpOnly = options.httpOnly !== false; // Default to true
        this.maxAge = options.maxAge || 24 * 60 * 60 * 1000; // 24 hours
    }

    /**
     * Generate a secure CSRF token
     */
    generateToken() {
        return crypto.randomBytes(this.tokenLength).toString('hex');
    }

    /**
     * Create HMAC signature for token verification
     */
    createSignature(token, timestamp = Date.now()) {
        const data = `${token}:${timestamp}`;
        return crypto
            .createHmac('sha256', this.secret)
            .update(data)
            .digest('hex');
    }

    /**
     * Verify CSRF token signature and timestamp
     */
    verifyToken(token, signature, timestamp) {
        // Check if token is expired (max 24 hours)
        const now = Date.now();
        const tokenAge = now - parseInt(timestamp);
        if (tokenAge > this.maxAge) {
            return false;
        }

        // Verify signature
        const expectedSignature = this.createSignature(token, timestamp);
        
        // Use constant time comparison to prevent timing attacks
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    }

    /**
     * Validate Origin and Referer headers
     */
    validateHeaders(req) {
        const origin = req.get('Origin');
        const referer = req.get('Referer');
        const host = req.get('Host');
        
        // In production, ensure requests come from same origin
        if (process.env.NODE_ENV === 'production') {
            const allowedOrigins = [
                `https://${host}`,
                'https://townranker.com',
                'https://www.townranker.com'
            ];

            // Check Origin header
            if (origin && !allowedOrigins.includes(origin)) {
                return false;
            }

            // Check Referer header as fallback
            if (!origin && referer) {
                const refererUrl = new URL(referer);
                if (!allowedOrigins.some(allowed => refererUrl.origin === allowed)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * CSRF protection middleware
     */
    protect() {
        return (req, res, next) => {
            // Skip protection for safe methods
            if (this.ignoreMethods.includes(req.method)) {
                // Generate token for safe requests to be used in forms
                const token = this.generateToken();
                const timestamp = Date.now();
                const signature = this.createSignature(token, timestamp);
                
                // Set CSRF token cookie
                res.cookie(this.cookieName, `${token}:${timestamp}:${signature}`, {
                    httpOnly: this.httpOnly,
                    secure: this.secure && req.secure,
                    sameSite: this.sameSite,
                    maxAge: this.maxAge
                });

                // Make token available to templates
                res.locals.csrfToken = token;
                return next();
            }

            // Validate headers for unsafe methods
            if (!this.validateHeaders(req)) {
                return res.status(403).json({
                    success: false,
                    error: 'CSRF_INVALID_ORIGIN',
                    message: 'Request origin validation failed'
                });
            }

            // Get token from header, body, or query
            let clientToken = req.get(this.headerName) || 
                            req.body._csrf || 
                            req.query._csrf;

            // Get token from cookie
            const cookieToken = req.cookies[this.cookieName];

            if (!clientToken || !cookieToken) {
                return res.status(403).json({
                    success: false,
                    error: 'CSRF_TOKEN_MISSING',
                    message: 'CSRF token is required'
                });
            }

            // Parse cookie token
            const [token, timestamp, signature] = cookieToken.split(':');
            
            if (!token || !timestamp || !signature) {
                return res.status(403).json({
                    success: false,
                    error: 'CSRF_TOKEN_MALFORMED',
                    message: 'CSRF token is malformed'
                });
            }

            // Verify token matches
            if (!crypto.timingSafeEqual(
                Buffer.from(clientToken, 'hex'),
                Buffer.from(token, 'hex')
            )) {
                return res.status(403).json({
                    success: false,
                    error: 'CSRF_TOKEN_MISMATCH',
                    message: 'CSRF token validation failed'
                });
            }

            // Verify token signature and timestamp
            if (!this.verifyToken(token, signature, timestamp)) {
                return res.status(403).json({
                    success: false,
                    error: 'CSRF_TOKEN_INVALID',
                    message: 'CSRF token is invalid or expired'
                });
            }

            next();
        };
    }

    /**
     * Middleware to add CSRF token to API responses
     */
    addTokenToResponse() {
        return (req, res, next) => {
            const originalJson = res.json;
            res.json = function(data) {
                // Add CSRF token to API responses
                if (data && typeof data === 'object' && !data.csrfToken && res.locals.csrfToken) {
                    data.csrfToken = res.locals.csrfToken;
                }
                return originalJson.call(this, data);
            };
            next();
        };
    }
}

module.exports = CSRFProtection;