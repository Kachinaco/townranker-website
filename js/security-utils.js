/**
 * Client-Side Security Utilities for TownRanker
 * 
 * Provides secure DOM manipulation functions to prevent XSS:
 * - Safe HTML insertion
 * - Input sanitization
 * - CSRF token handling
 * - Secure event handling
 */

class SecurityUtils {
    constructor() {
        this.csrfToken = null;
        this.init();
    }

    /**
     * Initialize security utilities
     */
    init() {
        // Get CSRF token from meta tag or cookie
        this.loadCSRFToken();
        
        // Set up secure defaults
        this.setupSecureDefaults();
    }

    /**
     * Load CSRF token from various sources
     */
    loadCSRFToken() {
        // Try meta tag first
        const metaToken = document.querySelector('meta[name="csrf-token"]');
        if (metaToken) {
            this.csrfToken = metaToken.getAttribute('content');
            return;
        }

        // Try cookie as fallback
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === '_csrfToken' && value) {
                const [token] = value.split(':');
                this.csrfToken = token;
                return;
            }
        }
    }

    /**
     * HTML encode text to prevent XSS
     */
    static escapeHTML(text) {
        if (typeof text !== 'string') return text;
        
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Create text node instead of using innerHTML
     */
    static safeSetText(element, text) {
        if (!element) return;
        
        // Clear existing content
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
        
        // Add safe text node
        if (text) {
            element.appendChild(document.createTextNode(String(text)));
        }
    }

    /**
     * Safely set HTML content with sanitization
     */
    static safeSetHTML(element, html) {
        if (!element) return;
        
        // Basic sanitization - remove script tags and event handlers
        const sanitized = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
            .replace(/\s*on\w+\s*=\s*[^>\s]*/gi, '')
            .replace(/javascript\s*:/gi, '')
            .replace(/vbscript\s*:/gi, '')
            .replace(/data\s*:\s*text\/html/gi, '');
        
        element.innerHTML = sanitized;
    }

    /**
     * Secure alternative to innerHTML for displaying user data
     */
    static displayUserContent(element, content, options = {}) {
        if (!element) return;
        
        const { allowHTML = false, maxLength = 1000 } = options;
        
        // Truncate content if too long
        let displayContent = String(content || '');
        if (displayContent.length > maxLength) {
            displayContent = displayContent.substring(0, maxLength) + '...';
        }
        
        if (allowHTML) {
            this.safeSetHTML(element, displayContent);
        } else {
            this.safeSetText(element, displayContent);
        }
    }

    /**
     * Create secure DOM element
     */
    static createElement(tagName, attributes = {}, textContent = null) {
        const element = document.createElement(tagName);
        
        // Safe attribute setting
        Object.entries(attributes).forEach(([key, value]) => {
            // Skip dangerous attributes
            if (key.toLowerCase().startsWith('on') || key === 'href' && value.includes('javascript:')) {
                return;
            }
            
            element.setAttribute(key, this.escapeHTML(String(value)));
        });
        
        if (textContent) {
            this.safeSetText(element, textContent);
        }
        
        return element;
    }

    /**
     * Secure AJAX request with CSRF protection
     */
    secureRequest(url, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        };

        // Add CSRF token for state-changing requests
        if (this.csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method?.toUpperCase())) {
            defaultOptions.headers['X-CSRF-Token'] = this.csrfToken;
        }

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        return fetch(url, mergedOptions)
            .then(response => {
                // Check for new CSRF token
                const newToken = response.headers.get('X-New-Token');
                if (newToken) {
                    this.csrfToken = newToken;
                }
                
                return response;
            });
    }

    /**
     * Secure form submission
     */
    static secureFormSubmit(form, callback) {
        if (!form) return;
        
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(form);
            const data = {};
            
            // Sanitize form data
            for (let [key, value] of formData.entries()) {
                // Basic input validation
                if (typeof value === 'string') {
                    // Remove potential XSS payloads
                    value = value
                        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/javascript\s*:/gi, '')
                        .trim();
                    
                    // Length limit
                    if (value.length > 10000) {
                        value = value.substring(0, 10000);
                    }
                }
                data[key] = value;
            }
            
            if (callback) {
                callback(data);
            }
        });
    }

    /**
     * Secure event listener attachment
     */
    static addSecureEventListener(element, event, handler, options = {}) {
        if (!element || typeof handler !== 'function') return;
        
        const secureHandler = function(e) {
            try {
                // Basic event sanitization
                if (e.target && e.target.tagName === 'SCRIPT') {
                    e.preventDefault();
                    return;
                }
                
                handler.call(this, e);
            } catch (error) {
                console.error('Event handler error:', error);
            }
        };
        
        element.addEventListener(event, secureHandler, options);
    }

    /**
     * Validate and sanitize URL
     */
    static sanitizeURL(url) {
        if (typeof url !== 'string') return '#';
        
        // Remove dangerous protocols
        if (url.match(/^(javascript|vbscript|data):/i)) {
            return '#';
        }
        
        // Ensure relative URLs are safe
        if (url.startsWith('//')) {
            return '#';
        }
        
        return url;
    }

    /**
     * Secure localStorage operations
     */
    static secureStorage = {
        set(key, value) {
            try {
                const sanitizedKey = SecurityUtils.escapeHTML(String(key));
                const sanitizedValue = JSON.stringify(value);
                localStorage.setItem(sanitizedKey, sanitizedValue);
            } catch (error) {
                console.error('Storage set error:', error);
            }
        },
        
        get(key) {
            try {
                const sanitizedKey = SecurityUtils.escapeHTML(String(key));
                const value = localStorage.getItem(sanitizedKey);
                return value ? JSON.parse(value) : null;
            } catch (error) {
                console.error('Storage get error:', error);
                return null;
            }
        },
        
        remove(key) {
            try {
                const sanitizedKey = SecurityUtils.escapeHTML(String(key));
                localStorage.removeItem(sanitizedKey);
            } catch (error) {
                console.error('Storage remove error:', error);
            }
        }
    };

    /**
     * Setup secure defaults for the application
     */
    setupSecureDefaults() {
        // Prevent drag and drop of external content
        document.addEventListener('dragover', function(e) {
            e.preventDefault();
        });
        
        document.addEventListener('drop', function(e) {
            e.preventDefault();
        });
        
        // Prevent context menu in production
        if (window.location.hostname === 'townranker.com') {
            document.addEventListener('contextmenu', function(e) {
                e.preventDefault();
            });
        }
        
        // Clear sensitive data on page unload
        window.addEventListener('beforeunload', function() {
            // Clear any temporary sensitive data
            if (window.tempSensitiveData) {
                window.tempSensitiveData = null;
            }
        });
    }

    /**
     * Input validation helpers
     */
    static validation = {
        email(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(String(email).toLowerCase());
        },
        
        phone(phone) {
            const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
            return phoneRegex.test(String(phone));
        },
        
        alphanumeric(str) {
            const alphaRegex = /^[a-zA-Z0-9\s]+$/;
            return alphaRegex.test(String(str));
        },
        
        noScript(str) {
            const scriptRegex = /<script|javascript:|vbscript:|data:text\/html/i;
            return !scriptRegex.test(String(str));
        }
    };
}

// Initialize security utils when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        window.SecurityUtils = new SecurityUtils();
    });
} else {
    window.SecurityUtils = new SecurityUtils();
}

// Make static methods globally available (check if window.SecurityUtils exists first)
if (window.SecurityUtils) {
    window.SecurityUtils.escapeHTML = SecurityUtils.escapeHTML;
    window.SecurityUtils.safeSetText = SecurityUtils.safeSetText;
    window.SecurityUtils.safeSetHTML = SecurityUtils.safeSetHTML;
    window.SecurityUtils.displayUserContent = SecurityUtils.displayUserContent;
    window.SecurityUtils.createElement = SecurityUtils.createElement;
    window.SecurityUtils.secureFormSubmit = SecurityUtils.secureFormSubmit;
    window.SecurityUtils.addSecureEventListener = SecurityUtils.addSecureEventListener;
    window.SecurityUtils.sanitizeURL = SecurityUtils.sanitizeURL;
    window.SecurityUtils.secureStorage = SecurityUtils.secureStorage;
    window.SecurityUtils.validation = SecurityUtils.validation;
}