/**
 * Frontend Error Handler for TownRanker
 * 
 * Provides comprehensive frontend error handling with:
 * - Global error catching and reporting
 * - User-friendly error messages
 * - Automatic retry mechanisms
 * - Error recovery strategies
 * - Performance monitoring
 */

class FrontendErrorHandler {
    constructor() {
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.errorQueue = [];
        this.errorStats = {
            total: 0,
            network: 0,
            api: 0,
            javascript: 0,
            validation: 0
        };
        
        this.init();
    }

    init() {
        this.setupGlobalErrorHandlers();
        this.setupNetworkErrorHandling();
        this.setupPerformanceMonitoring();
        this.createNotificationSystem();
    }

    /**
     * Setup global JavaScript error handlers
     */
    setupGlobalErrorHandlers() {
        // Handle uncaught JavaScript errors
        window.addEventListener('error', (event) => {
            this.handleJavaScriptError({
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack
            });
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handlePromiseRejection({
                reason: event.reason,
                promise: event.promise
            });
        });

        // Handle fetch/network errors
        this.wrapFetch();
    }

    /**
     * Handle JavaScript errors
     */
    handleJavaScriptError(errorInfo) {
        this.errorStats.javascript++;
        this.errorStats.total++;

        const error = {
            type: 'javascript',
            message: errorInfo.message,
            location: `${errorInfo.filename}:${errorInfo.lineno}:${errorInfo.colno}`,
            stack: errorInfo.stack,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent
        };

        this.logError(error);
        
        // Don't show intrusive messages for minor errors
        if (!this.isMinorError(errorInfo.message)) {
            this.showUserNotification(
                'Something went wrong',
                'We encountered an issue. Please refresh the page if problems persist.',
                'warning'
            );
        }
    }

    /**
     * Handle unhandled promise rejections
     */
    handlePromiseRejection(rejectionInfo) {
        this.errorStats.total++;

        const error = {
            type: 'promise_rejection',
            reason: rejectionInfo.reason?.toString() || 'Unknown promise rejection',
            timestamp: new Date().toISOString(),
            url: window.location.href
        };

        this.logError(error);

        // Try to provide helpful context
        if (rejectionInfo.reason?.message?.includes('fetch')) {
            this.handleNetworkError(rejectionInfo.reason);
        } else {
            console.warn('Unhandled promise rejection:', rejectionInfo.reason);
        }
    }

    /**
     * Wrap fetch for better error handling
     */
    wrapFetch() {
        const originalFetch = window.fetch;
        
        window.fetch = async (url, options = {}) => {
            // Add default timeout if not specified
            if (!options.signal) {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 30000); // 30 second timeout
                options.signal = controller.signal;
            }

            try {
                const response = await originalFetch(url, options);
                
                // Log for debugging
                if (url.includes('/api/send-customer-email')) {
                    console.log('Email API Response:', {
                        ok: response.ok,
                        status: response.status,
                        statusText: response.statusText,
                        url: response.url
                    });
                }
                
                // Handle HTTP errors
                if (!response.ok) {
                    throw new FetchError(
                        `HTTP ${response.status}: ${response.statusText}`,
                        response.status,
                        response
                    );
                }
                
                return response;
            } catch (error) {
                this.handleNetworkError(error, url, options);
                throw error;
            }
        };
    }

    /**
     * Handle network/API errors
     */
    handleNetworkError(error, url = '', options = {}) {
        this.errorStats.network++;
        this.errorStats.total++;

        const networkError = {
            type: 'network',
            message: error.message,
            url: url,
            method: options.method || 'GET',
            status: error.status,
            timestamp: new Date().toISOString()
        };

        this.logError(networkError);

        // Determine appropriate user message
        let userMessage = 'Network error occurred. Please check your connection.';
        let severity = 'error';

        if (error.name === 'AbortError') {
            userMessage = 'Request timed out. Please try again.';
        } else if (error.status === 401) {
            userMessage = 'Your session has expired. Please log in again.';
            this.handleAuthenticationError();
        } else if (error.status === 403) {
            userMessage = 'You don\'t have permission to perform this action.';
        } else if (error.status === 404) {
            userMessage = 'The requested resource was not found.';
        } else if (error.status === 429) {
            userMessage = 'Too many requests. Please wait and try again.';
        } else if (error.status >= 500) {
            userMessage = 'Server error occurred. We\'re working to fix this.';
        } else if (!navigator.onLine) {
            userMessage = 'You appear to be offline. Please check your internet connection.';
        }

        this.showUserNotification('Connection Issue', userMessage, severity);
    }

    /**
     * Create notification system
     */
    createNotificationSystem() {
        if (document.getElementById('error-notifications')) return;

        const container = document.createElement('div');
        container.id = 'error-notifications';
        container.className = 'error-notifications-container';
        container.innerHTML = `
            <style>
                .error-notifications-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 10000;
                    max-width: 400px;
                }
                
                .error-notification {
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    margin-bottom: 12px;
                    padding: 16px;
                    border-left: 4px solid #gray;
                    animation: slideIn 0.3s ease-out;
                    position: relative;
                }
                
                .error-notification.error {
                    border-left-color: #ef4444;
                    background: #fef2f2;
                }
                
                .error-notification.warning {
                    border-left-color: #f59e0b;
                    background: #fffbeb;
                }
                
                .error-notification.info {
                    border-left-color: #3b82f6;
                    background: #eff6ff;
                }
                
                .error-notification.success {
                    border-left-color: #10b981;
                    background: #ecfdf5;
                }
                
                .notification-title {
                    font-weight: 600;
                    font-size: 14px;
                    margin-bottom: 4px;
                }
                
                .notification-message {
                    font-size: 13px;
                    line-height: 1.4;
                    color: #6b7280;
                }
                
                .notification-close {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 4px;
                    color: #9ca3af;
                }
                
                .notification-actions {
                    margin-top: 12px;
                    display: flex;
                    gap: 8px;
                }
                
                .notification-btn {
                    padding: 6px 12px;
                    border: 1px solid #d1d5db;
                    background: white;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                
                .notification-btn:hover {
                    background: #f9fafb;
                }
                
                .notification-btn.primary {
                    background: #3b82f6;
                    color: white;
                    border-color: #3b82f6;
                }
                
                .notification-btn.primary:hover {
                    background: #2563eb;
                }
                
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                
                @keyframes slideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            </style>
        `;
        
        if (document.body) {
            document.body.appendChild(container);
        } else {
            // If body isn't ready, wait for DOM to load
            document.addEventListener('DOMContentLoaded', () => {
                document.body.appendChild(container);
            });
        }
    }

    /**
     * Show user notification
     */
    showUserNotification(title, message, type = 'info', actions = null, duration = 5000) {
        const container = document.getElementById('error-notifications');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `error-notification ${type}`;
        notification.innerHTML = `
            <button class="notification-close" onclick="this.parentElement.remove()">×</button>
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
            ${actions ? `<div class="notification-actions">${actions}</div>` : ''}
        `;

        container.appendChild(notification);

        // Auto-remove after duration (unless it has actions)
        if (!actions && duration > 0) {
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.style.animation = 'slideOut 0.3s ease-out';
                    setTimeout(() => notification.remove(), 300);
                }
            }, duration);
        }
    }

    /**
     * API call wrapper with retry logic
     */
    async callAPI(url, options = {}, retryCount = 0) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new APIError(errorData.error?.message || 'API request failed', response.status, errorData);
            }

            return await response.json();
        } catch (error) {
            // Retry logic for certain errors
            if (retryCount < this.retryAttempts && this.shouldRetry(error)) {
                console.warn(`API call failed, retrying (${retryCount + 1}/${this.retryAttempts}):`, error.message);
                await this.delay(this.retryDelay * (retryCount + 1));
                return this.callAPI(url, options, retryCount + 1);
            }

            this.handleAPIError(error, url, options);
            throw error;
        }
    }

    /**
     * Handle API errors
     */
    handleAPIError(error, url, options) {
        this.errorStats.api++;
        this.errorStats.total++;

        const apiError = {
            type: 'api',
            message: error.message,
            status: error.status,
            url: url,
            method: options.method || 'GET',
            timestamp: new Date().toISOString()
        };

        this.logError(apiError);

        // Handle specific API errors
        if (error.status === 401) {
            this.handleAuthenticationError();
        } else if (error.status === 403) {
            this.showUserNotification(
                'Access Denied',
                'You don\'t have permission to perform this action.',
                'error'
            );
        } else if (error.status >= 500) {
            this.showUserNotification(
                'Server Error',
                'Something went wrong on our end. Please try again later.',
                'error'
            );
        }
    }

    /**
     * Handle form validation errors
     */
    handleValidationErrors(errors, formElement) {
        this.errorStats.validation++;
        this.errorStats.total++;

        // Clear existing validation messages
        formElement.querySelectorAll('.validation-error').forEach(el => el.remove());

        // Show validation errors
        Object.entries(errors).forEach(([field, error]) => {
            const input = formElement.querySelector(`[name="${field}"], #${field}`);
            if (input) {
                const errorElement = document.createElement('div');
                errorElement.className = 'validation-error';
                errorElement.style.cssText = 'color: #ef4444; font-size: 12px; margin-top: 4px;';
                errorElement.textContent = error.message || error;
                
                input.style.borderColor = '#ef4444';
                input.parentElement.appendChild(errorElement);
            }
        });

        this.showUserNotification(
            'Validation Error',
            'Please correct the errors in the form and try again.',
            'warning'
        );
    }

    /**
     * Handle authentication errors
     */
    handleAuthenticationError() {
        this.showUserNotification(
            'Session Expired',
            'Your session has expired. Please log in again.',
            'warning',
            '<button class="notification-btn primary" onclick="window.location.href=\'/login.html\'">Log In</button>',
            0 // Don't auto-dismiss
        );
    }

    /**
     * Setup network error handling
     */
    setupNetworkErrorHandling() {
        // Monitor online/offline status
        window.addEventListener('online', () => {
            this.showUserNotification(
                'Back Online',
                'Your internet connection has been restored.',
                'success'
            );
        });

        window.addEventListener('offline', () => {
            this.showUserNotification(
                'Offline',
                'You appear to be offline. Some features may not work.',
                'warning',
                null,
                0 // Don't auto-dismiss
            );
        });
    }

    /**
     * Setup performance monitoring
     */
    setupPerformanceMonitoring() {
        // Monitor page load performance
        window.addEventListener('load', () => {
            if (window.performance) {
                const perfData = window.performance.timing;
                const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
                
                if (pageLoadTime > 5000) {
                    console.warn('Slow page load detected:', pageLoadTime + 'ms');
                    this.logError({
                        type: 'performance',
                        message: 'Slow page load',
                        loadTime: pageLoadTime,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        });
    }

    /**
     * Check if error should trigger retry
     */
    shouldRetry(error) {
        // Retry on network errors, timeouts, and 5xx errors
        return error.name === 'TypeError' || 
               error.name === 'AbortError' ||
               (error.status >= 500 && error.status < 600);
    }

    /**
     * Check if error is minor and shouldn't show notification
     */
    isMinorError(message) {
        const minorErrors = [
            'ResizeObserver loop limit exceeded',
            'Non-Error promise rejection captured',
            'Script error'
        ];
        
        return minorErrors.some(minor => message.includes(minor));
    }

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log error (can be sent to server)
     */
    logError(error) {
        // Console logging
        console.error('Frontend Error:', error);
        
        // Add to error queue for potential server reporting
        this.errorQueue.push(error);
        
        // Keep error queue size manageable
        if (this.errorQueue.length > 100) {
            this.errorQueue.shift();
        }
        
        // Could send to server for monitoring
        this.reportErrorToServer(error);
    }

    /**
     * Report error to server (optional)
     */
    async reportErrorToServer(error) {
        try {
            // Only report critical errors to avoid spam
            if (error.type === 'network' || error.type === 'api' || 
                (error.type === 'javascript' && !this.isMinorError(error.message))) {
                
                await fetch('/api/errors/report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...error,
                        sessionId: this.getSessionId(),
                        page: window.location.pathname
                    })
                });
            }
        } catch (reportError) {
            // Don't create infinite loop if error reporting fails
            console.warn('Failed to report error to server:', reportError);
        }
    }

    /**
     * Get or create session ID
     */
    getSessionId() {
        let sessionId = sessionStorage.getItem('errorSessionId');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('errorSessionId', sessionId);
        }
        return sessionId;
    }

    /**
     * Get error statistics
     */
    getErrorStats() {
        return {
            ...this.errorStats,
            errorQueue: this.errorQueue.length,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Reset error statistics
     */
    resetErrorStats() {
        this.errorStats = {
            total: 0,
            network: 0,
            api: 0,
            javascript: 0,
            validation: 0
        };
        this.errorQueue = [];
    }
}

// Custom error classes
class FetchError extends Error {
    constructor(message, status, response) {
        super(message);
        this.name = 'FetchError';
        this.status = status;
        this.response = response;
    }
}

class APIError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.data = data;
    }
}

// Initialize global error handler
const errorHandler = new FrontendErrorHandler();

// Make available globally
window.errorHandler = errorHandler;
window.callAPI = errorHandler.callAPI.bind(errorHandler);

// Export for modules if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FrontendErrorHandler, errorHandler };
}