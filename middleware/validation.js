/**
 * Input Validation Middleware for TownRanker
 * 
 * Provides comprehensive input validation and sanitization for:
 * - Email addresses
 * - Phone numbers
 * - MongoDB ObjectIds
 * - Request body sanitization
 * - SQL/NoSQL injection prevention
 */

const mongoose = require('mongoose');

class ValidationMiddleware {
    /**
     * Enhanced NoSQL injection prevention patterns
     */
    static dangerousMongoOperators = new Set([
        '$where', '$regex', '$expr', '$jsonSchema', '$text', '$mod',
        '$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin', '$exists',
        '$type', '$size', '$all', '$elemMatch', '$slice', '$pop',
        '$push', '$pull', '$pullAll', '$addToSet', '$each', '$position',
        '$sort', '$unset', '$rename', '$inc', '$mul', '$min', '$max',
        '$currentDate', '$bit', '$isolated'
    ]);

    /**
     * Comprehensive NoSQL injection sanitization
     */
    static sanitizeInput(input, depth = 0) {
        // Prevent deep recursion DoS attacks
        if (depth > 10) {
            throw new Error('Input nesting too deep');
        }

        if (typeof input === 'string') {
            // Remove MongoDB operators from strings
            let sanitized = input
                .replace(/\$\w+/g, '') // Remove all $ operators
                .replace(/[{}]/g, '') // Remove braces
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
                .replace(/javascript\s*:/gi, '') // Remove javascript: protocol
                .replace(/vbscript\s*:/gi, '') // Remove vbscript: protocol
                .replace(/data\s*:/gi, '') // Remove data: protocol
                .replace(/[<>]/g, '') // Remove angle brackets
                .trim();

            // Additional length check to prevent DoS
            if (sanitized.length > 10000) {
                sanitized = sanitized.substring(0, 10000);
            }

            return sanitized;
        }
        
        if (Array.isArray(input)) {
            // Limit array size to prevent DoS
            if (input.length > 1000) {
                throw new Error('Array too large');
            }
            return input
                .filter(item => item !== null && item !== undefined)
                .map(item => this.sanitizeInput(item, depth + 1));
        }
        
        if (typeof input === 'object' && input !== null) {
            // Prevent prototype pollution and dangerous operators
            const sanitized = {};
            const keys = Object.keys(input);
            
            // Limit object size to prevent DoS
            if (keys.length > 100) {
                throw new Error('Object has too many properties');
            }
            
            for (const key of keys) {
                // Skip dangerous keys
                if (key === '__proto__' || 
                    key === 'constructor' || 
                    key === 'prototype' ||
                    key.startsWith('$') ||
                    key.includes('.') ||
                    this.dangerousMongoOperators.has(key)) {
                    continue;
                }
                
                // Sanitize key name
                const cleanKey = this.sanitizeInput(key, depth + 1);
                if (cleanKey && cleanKey.length > 0) {
                    sanitized[cleanKey] = this.sanitizeInput(input[key], depth + 1);
                }
            }
            return sanitized;
        }
        
        // Handle numbers and booleans
        if (typeof input === 'number') {
            // Prevent extremely large numbers that could cause issues
            if (Math.abs(input) > Number.MAX_SAFE_INTEGER) {
                return 0;
            }
            return input;
        }
        
        if (typeof input === 'boolean') {
            return input;
        }
        
        // For any other type, return null
        return null;
    }

    /**
     * Validate against known NoSQL injection patterns
     */
    static containsInjectionPattern(input) {
        if (typeof input !== 'string') return false;
        
        const injectionPatterns = [
            /\$where/i,
            /\$regex/i,
            /\$expr/i,
            /\{\s*\$\w+/i,
            /javascript\s*:/i,
            /eval\s*\(/i,
            /function\s*\(/i,
            /this\./i,
            /process\./i,
            /require\s*\(/i
        ];
        
        return injectionPatterns.some(pattern => pattern.test(input));
    }

    /**
     * Validate email format
     */
    static isValidEmail(email) {
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        return emailRegex.test(email);
    }

    /**
     * Validate phone number format
     */
    static isValidPhone(phone) {
        // Remove all non-numeric characters for validation
        const cleanPhone = phone.replace(/\D/g, '');
        // Accept 10-15 digit phone numbers
        return cleanPhone.length >= 10 && cleanPhone.length <= 15;
    }

    /**
     * Validate MongoDB ObjectId
     */
    static isValidObjectId(id) {
        return mongoose.Types.ObjectId.isValid(id);
    }

    /**
     * Validate project type
     */
    static isValidProjectType(type) {
        const validTypes = [
            'website-design', 'seo', 'digital-marketing', 
            'e-commerce', 'mobile-app', 'other'
        ];
        return validTypes.includes(type);
    }

    /**
     * Validate priority level
     */
    static isValidPriority(priority) {
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        return validPriorities.includes(priority);
    }

    /**
     * Validate status values
     */
    static isValidStatus(status, validStatuses) {
        return validStatuses.includes(status);
    }

    /**
     * Validate budget amount
     */
    static isValidBudget(budget) {
        const amount = parseFloat(budget);
        return !isNaN(amount) && amount >= 0 && amount <= 10000000; // Max $10M
    }

    /**
     * Validate string length
     */
    static isValidLength(str, min = 0, max = 1000) {
        return typeof str === 'string' && str.length >= min && str.length <= max;
    }

    /**
     * General request body sanitization middleware
     */
    static sanitizeBody(req, res, next) {
        try {
            if (req.body) {
                req.body = ValidationMiddleware.sanitizeInput(req.body);
            }
            next();
        } catch (error) {
            console.error('❌ Request sanitization error:', error.message);
            return res.status(400).json({
                success: false,
                message: 'Invalid request format'
            });
        }
    }

    /**
     * Lead validation middleware
     */
    static validateLead(req, res, next) {
        const { name, email, phone, projectType, budget } = req.body;
        const errors = [];

        // Required field validation
        if (!name || !ValidationMiddleware.isValidLength(name, 1, 100)) {
            errors.push('Name is required and must be between 1-100 characters');
        }

        if (!email || !ValidationMiddleware.isValidEmail(email)) {
            errors.push('Valid email address is required');
        }

        if (!phone || !ValidationMiddleware.isValidPhone(phone)) {
            errors.push('Valid phone number is required');
        }

        // Optional field validation
        if (projectType && !ValidationMiddleware.isValidProjectType(projectType)) {
            errors.push('Invalid project type');
        }

        if (budget !== undefined && budget !== null && !ValidationMiddleware.isValidBudget(budget)) {
            errors.push('Budget must be a valid positive number');
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
        }

        next();
    }

    /**
     * User validation middleware
     */
    static validateUser(req, res, next) {
        const { email, password, name, role } = req.body;
        const errors = [];

        if (!email || !ValidationMiddleware.isValidEmail(email)) {
            errors.push('Valid email address is required');
        }

        if (!password || password.length < 8) {
            errors.push('Password must be at least 8 characters long');
        }

        if (!name || !ValidationMiddleware.isValidLength(name, 1, 100)) {
            errors.push('Name is required and must be between 1-100 characters');
        }

        if (role && !['admin', 'manager', 'viewer'].includes(role)) {
            errors.push('Invalid user role');
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'User validation failed',
                errors
            });
        }

        next();
    }

    /**
     * Customer validation middleware
     */
    static validateCustomer(req, res, next) {
        const { name, email, phone, status, priority, budget } = req.body;
        const errors = [];

        if (!name || !ValidationMiddleware.isValidLength(name, 1, 100)) {
            errors.push('Name is required and must be between 1-100 characters');
        }

        if (!email || !ValidationMiddleware.isValidEmail(email)) {
            errors.push('Valid email address is required');
        }

        if (!phone || !ValidationMiddleware.isValidPhone(phone)) {
            errors.push('Valid phone number is required');
        }

        const validStatuses = ['lead', 'prospect', 'client', 'inactive', 'completed'];
        if (status && !ValidationMiddleware.isValidStatus(status, validStatuses)) {
            errors.push('Invalid customer status');
        }

        if (priority && !ValidationMiddleware.isValidPriority(priority)) {
            errors.push('Invalid priority level');
        }

        if (budget !== undefined && budget !== null && !ValidationMiddleware.isValidBudget(budget)) {
            errors.push('Budget must be a valid positive number');
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Customer validation failed',
                errors
            });
        }

        next();
    }

    /**
     * Project validation middleware
     */
    static validateProject(req, res, next) {
        const { name, description, customer, type, budget, startDate, endDate } = req.body;
        const errors = [];

        if (!name || !ValidationMiddleware.isValidLength(name, 1, 100)) {
            errors.push('Project name is required and must be between 1-100 characters');
        }

        if (!description || !ValidationMiddleware.isValidLength(description, 1, 1000)) {
            errors.push('Project description is required and must be between 1-1000 characters');
        }

        if (!customer || !ValidationMiddleware.isValidObjectId(customer)) {
            errors.push('Valid customer ID is required');
        }

        const validTypes = ['business', 'ecommerce', 'webapp', 'landing', 'custom'];
        if (!type || !validTypes.includes(type)) {
            errors.push('Valid project type is required');
        }

        if (!budget || !ValidationMiddleware.isValidBudget(budget)) {
            errors.push('Valid budget amount is required');
        }

        if (!startDate || isNaN(Date.parse(startDate))) {
            errors.push('Valid start date is required');
        }

        if (!endDate || isNaN(Date.parse(endDate))) {
            errors.push('Valid end date is required');
        }

        if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
            errors.push('End date must be after start date');
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Project validation failed',
                errors
            });
        }

        next();
    }

    /**
     * ObjectId parameter validation middleware
     */
    static validateObjectIdParam(paramName = 'id') {
        return (req, res, next) => {
            const id = req.params[paramName];
            
            if (!ValidationMiddleware.isValidObjectId(id)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid ${paramName} format`
                });
            }
            
            next();
        };
    }

    /**
     * Pagination parameters validation
     */
    static validatePagination(req, res, next) {
        const { page = 1, limit = 20 } = req.query;
        
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        
        if (isNaN(pageNum) || pageNum < 1) {
            return res.status(400).json({
                success: false,
                message: 'Page must be a positive integer'
            });
        }
        
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
            return res.status(400).json({
                success: false,
                message: 'Limit must be between 1 and 100'
            });
        }
        
        req.pagination = {
            page: pageNum,
            limit: limitNum,
            skip: (pageNum - 1) * limitNum
        };
        
        next();
    }

    /**
     * Rate limiting validation helper
     */
    static validateRateLimit(identifier, maxRequests = 100, windowMs = 60000) {
        // This would typically integrate with a Redis store or in-memory cache
        // For now, we'll use a simple in-memory approach
        if (!this.rateLimitStore) {
            this.rateLimitStore = new Map();
        }
        
        const now = Date.now();
        const key = `${identifier}:${Math.floor(now / windowMs)}`;
        
        const currentCount = this.rateLimitStore.get(key) || 0;
        
        if (currentCount >= maxRequests) {
            return false;
        }
        
        this.rateLimitStore.set(key, currentCount + 1);
        
        // Clean up old entries
        for (const [storeKey] of this.rateLimitStore) {
            const [, timestamp] = storeKey.split(':');
            if (now - parseInt(timestamp) * windowMs > windowMs * 2) {
                this.rateLimitStore.delete(storeKey);
            }
        }
        
        return true;
    }

    /**
     * Content-Type validation middleware
     */
    static validateContentType(req, res, next) {
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
            const contentType = req.get('Content-Type');
            
            if (!contentType || !contentType.includes('application/json')) {
                return res.status(415).json({
                    success: false,
                    message: 'Content-Type must be application/json'
                });
            }
        }
        
        next();
    }
}

module.exports = ValidationMiddleware;