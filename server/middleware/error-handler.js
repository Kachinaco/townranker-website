/**
 * Global Error Handler Middleware for TownRanker
 * 
 * Provides centralized error handling with:
 * - Standardized error responses
 * - Error logging and monitoring
 * - Security-aware error messages
 * - Performance tracking
 * - Recovery mechanisms
 */

const fs = require('fs').promises;
const path = require('path');

class ErrorHandler {
    constructor() {
        this.errorLogPath = path.join(__dirname, '..', 'logs', 'errors.log');
        this.errorStats = {
            total: 0,
            byType: {},
            byEndpoint: {},
            byStatusCode: {}
        };
        this.ensureLogDirectory();
    }

    async ensureLogDirectory() {
        try {
            const logDir = path.dirname(this.errorLogPath);
            await fs.mkdir(logDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create log directory:', error);
        }
    }

    /**
     * Main error handling middleware
     */
    handleError() {
        return async (error, req, res, next) => {
            // Track error statistics
            this.updateErrorStats(error, req);

            // Log error details
            await this.logError(error, req);

            // Determine error response
            const errorResponse = this.buildErrorResponse(error, req);

            // Send standardized error response
            res.status(errorResponse.statusCode).json(errorResponse.body);
        };
    }

    /**
     * Express async error wrapper
     */
    asyncHandler(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }

    /**
     * Build standardized error response
     */
    buildErrorResponse(error, req) {
        const isProduction = process.env.NODE_ENV === 'production';
        
        // Determine status code
        let statusCode = 500;
        let errorCode = 'INTERNAL_SERVER_ERROR';
        let userMessage = 'An unexpected error occurred. Please try again later.';

        // Map specific error types
        if (error.name === 'ValidationError') {
            statusCode = 400;
            errorCode = 'VALIDATION_ERROR';
            userMessage = 'The provided data is invalid. Please check your input and try again.';
        } else if (error.name === 'CastError') {
            statusCode = 400;
            errorCode = 'INVALID_ID';
            userMessage = 'Invalid ID format provided.';
        } else if (error.code === 11000) {
            statusCode = 409;
            errorCode = 'DUPLICATE_ENTRY';
            userMessage = 'This record already exists. Please use different values.';
        } else if (error.name === 'MongoNetworkError') {
            statusCode = 503;
            errorCode = 'DATABASE_UNAVAILABLE';
            userMessage = 'Service temporarily unavailable. Please try again in a few moments.';
        } else if (error.name === 'TokenExpiredError') {
            statusCode = 401;
            errorCode = 'TOKEN_EXPIRED';
            userMessage = 'Your session has expired. Please log in again.';
        } else if (error.name === 'JsonWebTokenError') {
            statusCode = 401;
            errorCode = 'INVALID_TOKEN';
            userMessage = 'Authentication failed. Please log in again.';
        } else if (error.status) {
            statusCode = error.status;
            if (statusCode === 400) {
                errorCode = 'BAD_REQUEST';
                userMessage = 'Invalid request format. Please check your data and try again.';
            } else if (statusCode === 401) {
                errorCode = 'UNAUTHORIZED';
                userMessage = 'Authentication required. Please log in to continue.';
            } else if (statusCode === 403) {
                errorCode = 'FORBIDDEN';
                userMessage = 'You do not have permission to perform this action.';
            } else if (statusCode === 404) {
                errorCode = 'NOT_FOUND';
                userMessage = 'The requested resource was not found.';
            } else if (statusCode === 429) {
                errorCode = 'RATE_LIMIT_EXCEEDED';
                userMessage = 'Too many requests. Please wait before trying again.';
            }
        }

        // Build response body
        const responseBody = {
            success: false,
            error: {
                code: errorCode,
                message: userMessage,
                timestamp: new Date().toISOString(),
                requestId: req.id || this.generateRequestId(),
                statusCode
            }
        };

        // Add validation details for validation errors
        if (error.name === 'ValidationError' && error.errors) {
            responseBody.error.details = Object.values(error.errors).map(e => ({
                field: e.path,
                message: e.message,
                value: e.value
            }));
        }

        // Add debug info in development
        if (!isProduction) {
            responseBody.debug = {
                originalMessage: error.message,
                stack: error.stack,
                endpoint: `${req.method} ${req.path}`,
                userAgent: req.get('User-Agent'),
                ip: req.ip
            };
        }

        return {
            statusCode,
            body: responseBody
        };
    }

    /**
     * Log error details
     */
    async logError(error, req) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            requestId: req.id || this.generateRequestId(),
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.id || 'anonymous',
            error: {
                name: error.name,
                message: error.message,
                code: error.code,
                stack: error.stack
            },
            body: this.sanitizeBody(req.body),
            query: req.query,
            params: req.params
        };

        try {
            await fs.appendFile(this.errorLogPath, JSON.stringify(logEntry) + '\n');
            console.error('🚨 Error logged:', {
                requestId: logEntry.requestId,
                method: logEntry.method,
                url: logEntry.url,
                error: error.message
            });
        } catch (logError) {
            console.error('Failed to write error log:', logError);
        }
    }

    /**
     * Update error statistics
     */
    updateErrorStats(error, req) {
        this.errorStats.total++;
        
        // By error type
        const errorType = error.name || 'UnknownError';
        this.errorStats.byType[errorType] = (this.errorStats.byType[errorType] || 0) + 1;
        
        // By endpoint
        const endpoint = `${req.method} ${req.route?.path || req.path}`;
        this.errorStats.byEndpoint[endpoint] = (this.errorStats.byEndpoint[endpoint] || 0) + 1;
        
        // By status code
        const statusCode = error.status || 500;
        this.errorStats.byStatusCode[statusCode] = (this.errorStats.byStatusCode[statusCode] || 0) + 1;
    }

    /**
     * Sanitize request body for logging (remove sensitive data)
     */
    sanitizeBody(body) {
        if (!body || typeof body !== 'object') return body;

        const sanitized = { ...body };
        const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'authorization'];
        
        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }
        
        return sanitized;
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get error statistics
     */
    getErrorStats() {
        return {
            ...this.errorStats,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * 404 Not Found handler
     */
    notFoundHandler() {
        return (req, res, next) => {
            const error = new Error(`Cannot ${req.method} ${req.path}`);
            error.status = 404;
            error.name = 'NotFoundError';
            next(error);
        };
    }

    /**
     * Validation error handler for express-validator
     */
    validationErrorHandler() {
        return (req, res, next) => {
            const { validationResult } = require('express-validator');
            const errors = validationResult(req);
            
            if (!errors.isEmpty()) {
                const validationError = new Error('Validation failed');
                validationError.name = 'ValidationError';
                validationError.status = 400;
                validationError.errors = errors.array().reduce((acc, err) => {
                    acc[err.param] = {
                        path: err.param,
                        message: err.msg,
                        value: err.value
                    };
                    return acc;
                }, {});
                
                return next(validationError);
            }
            
            next();
        };
    }

    /**
     * Rate limiting error handler
     */
    rateLimitErrorHandler() {
        return (req, res, next) => {
            const error = new Error('Too many requests from this IP, please try again later');
            error.status = 429;
            error.name = 'RateLimitError';
            next(error);
        };
    }

    /**
     * Database connection error handler
     */
    databaseErrorHandler() {
        return (error, req, res, next) => {
            if (error.name === 'MongoNetworkError' || 
                error.name === 'MongoTimeoutError' ||
                error.message.includes('connection')) {
                
                error.status = 503;
                error.name = 'DatabaseConnectionError';
            }
            
            next(error);
        };
    }

    /**
     * Graceful shutdown handler
     */
    setupGracefulShutdown(server) {
        const shutdown = (signal) => {
            console.log(`🛑 Received ${signal}. Shutting down gracefully...`);
            
            server.close(async (err) => {
                if (err) {
                    console.error('❌ Error during server shutdown:', err);
                    process.exit(1);
                }
                
                try {
                    // Save error stats before shutdown
                    const statsPath = path.join(__dirname, '..', 'logs', 'error-stats.json');
                    await fs.writeFile(statsPath, JSON.stringify(this.errorStats, null, 2));
                    console.log('✅ Error statistics saved');
                } catch (error) {
                    console.error('Failed to save error statistics:', error);
                }
                
                console.log('✅ Server shut down gracefully');
                process.exit(0);
            });
            
            // Force shutdown after 10 seconds
            setTimeout(() => {
                console.error('❌ Forcing shutdown...');
                process.exit(1);
            }, 10000);
        };
        
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }

    /**
     * Health check endpoint for error monitoring
     */
    healthCheckEndpoint() {
        return async (req, res) => {
            try {
                const health = {
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    errors: this.getErrorStats(),
                    memory: process.memoryUsage(),
                    version: process.version
                };
                
                // Check if error rate is too high
                const errorRate = this.errorStats.total / (process.uptime() / 60); // errors per minute
                if (errorRate > 10) {
                    health.status = 'degraded';
                    health.warnings = ['High error rate detected'];
                }
                
                res.json(health);
            } catch (error) {
                res.status(500).json({
                    status: 'unhealthy',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        };
    }
}

// Export singleton instance
module.exports = new ErrorHandler();