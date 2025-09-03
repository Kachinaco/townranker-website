/**
 * XSS Protection Middleware for TownRanker
 * 
 * Comprehensive XSS protection including:
 * - Input sanitization
 * - Output encoding
 * - Content Security Policy
 * - HTML filtering
 */

const he = require('he'); // HTML entity encoder (needs to be installed)

class XSSProtection {
    constructor(options = {}) {
        this.strictMode = options.strictMode !== false;
        this.allowedTags = options.allowedTags || [];
        this.allowedAttributes = options.allowedAttributes || [];
        this.maxStringLength = options.maxStringLength || 10000;
    }

    /**
     * Encode HTML entities to prevent XSS
     */
    encodeHTML(str) {
        if (typeof str !== 'string') return str;
        
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    /**
     * Remove dangerous script content
     */
    removeScriptContent(str) {
        if (typeof str !== 'string') return str;
        
        return str
            // Remove script tags and content
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            // Remove event handlers
            .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
            .replace(/\s*on\w+\s*=\s*[^>\s]*/gi, '')
            // Remove javascript: protocol
            .replace(/javascript\s*:/gi, '')
            // Remove data: URLs that could contain scripts
            .replace(/data\s*:\s*text\/html/gi, '')
            // Remove vbscript: protocol
            .replace(/vbscript\s*:/gi, '')
            // Remove style with expression
            .replace(/style\s*=\s*["'][^"']*expression\s*\([^"']*["']/gi, '')
            // Remove meta refresh redirects
            .replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');
    }

    /**
     * Sanitize dangerous characters and patterns
     */
    sanitizeString(str) {
        if (typeof str !== 'string') return str;
        
        // Limit string length to prevent DoS
        if (str.length > this.maxStringLength) {
            str = str.substring(0, this.maxStringLength);
        }

        // Remove null bytes
        str = str.replace(/\0/g, '');
        
        // Remove dangerous Unicode characters
        str = str.replace(/[\u200B-\u200D\uFEFF]/g, ''); // Zero-width characters
        str = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''); // Control characters
        
        // Encode HTML entities
        str = this.encodeHTML(str);
        
        // Remove script content
        str = this.removeScriptContent(str);
        
        return str.trim();
    }

    /**
     * Deep sanitize object properties
     */
    sanitizeObject(obj) {
        if (obj === null || obj === undefined) {
            return obj;
        }

        if (typeof obj === 'string') {
            return this.sanitizeString(obj);
        }

        if (typeof obj === 'number' || typeof obj === 'boolean') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.sanitizeObject(item));
        }

        if (typeof obj === 'object') {
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                // Sanitize key names too
                const cleanKey = this.sanitizeString(key);
                // Skip dangerous prototype pollution attempts
                if (cleanKey === '__proto__' || cleanKey === 'constructor' || cleanKey === 'prototype') {
                    continue;
                }
                sanitized[cleanKey] = this.sanitizeObject(value);
            }
            return sanitized;
        }

        return obj;
    }

    /**
     * Content Security Policy headers
     */
    setCSPHeaders(req, res, next) {
        // Strict CSP for production
        const csp = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://accounts.google.com https://maps.googleapis.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: https:",
            "connect-src 'self' https://accounts.google.com https://www.googleapis.com",
            "frame-src 'self' https://accounts.google.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
            "upgrade-insecure-requests"
        ].join('; ');

        res.setHeader('Content-Security-Policy', csp);
        
        // Additional XSS protection headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        
        next();
    }

    /**
     * Sanitize request body middleware
     */
    sanitizeInput() {
        return (req, res, next) => {
            try {
                if (req.body) {
                    req.body = this.sanitizeObject(req.body);
                }
                
                if (req.query) {
                    req.query = this.sanitizeObject(req.query);
                }
                
                if (req.params) {
                    req.params = this.sanitizeObject(req.params);
                }
                
                next();
            } catch (error) {
                console.error('XSS Protection Error:', error.message);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid input format'
                });
            }
        };
    }

    /**
     * Output sanitization middleware
     */
    sanitizeOutput() {
        return (req, res, next) => {
            const originalJson = res.json;
            const self = this;
            
            res.json = function(data) {
                if (data && typeof data === 'object') {
                    // Sanitize output data (less strict than input)
                    data = self.sanitizeOutputData(data);
                }
                return originalJson.call(this, data);
            };
            
            next();
        };
    }

    /**
     * Less strict sanitization for output data
     */
    sanitizeOutputData(obj) {
        if (obj === null || obj === undefined) {
            return obj;
        }

        if (typeof obj === 'string') {
            // Only remove the most dangerous content from output
            return this.removeScriptContent(obj);
        }

        if (typeof obj === 'number' || typeof obj === 'boolean') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.sanitizeOutputData(item));
        }

        if (typeof obj === 'object') {
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                sanitized[key] = this.sanitizeOutputData(value);
            }
            return sanitized;
        }

        return obj;
    }

    /**
     * Validate file uploads for XSS
     */
    validateFileUpload() {
        return (req, res, next) => {
            if (req.files || req.file) {
                const files = req.files || [req.file];
                
                for (const file of files) {
                    if (!file) continue;
                    
                    // Check file extension
                    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx'];
                    const ext = file.originalname.toLowerCase().substr(file.originalname.lastIndexOf('.'));
                    
                    if (!allowedExtensions.includes(ext)) {
                        return res.status(400).json({
                            success: false,
                            message: 'File type not allowed'
                        });
                    }
                    
                    // Sanitize filename
                    file.originalname = this.sanitizeString(file.originalname);
                }
            }
            
            next();
        };
    }
}

// Fallback HTML encoder if 'he' package is not available
if (typeof he === 'undefined') {
    global.he = {
        encode: (str) => {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;');
        }
    };
}

module.exports = XSSProtection;