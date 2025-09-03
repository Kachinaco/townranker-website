const axios = require('axios');
const mongoose = require('mongoose');
const NodeCache = require('node-cache');
const Communication = require('../models/Communication');
const Customer = require('../models/Customer');
const Lead = require('../models/Lead');
const { normalizePhoneNumber, validatePhoneNumber, getDbPhoneNumber } = require('../utils/phoneUtils');

// Rate limiting cache (SMS per phone number per hour)
const rateLimitCache = new NodeCache({ stdTTL: 3600 }); // 1 hour TTL
const MAX_SMS_PER_HOUR_PER_NUMBER = 10;
const MAX_SMS_PER_HOUR_TOTAL = 100;

// Retry cache for failed messages
const retryCache = new NodeCache({ stdTTL: 86400 }); // 24 hours TTL
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS = [30000, 300000, 1800000]; // 30s, 5m, 30m

class SMSService {
    constructor() {
        this.openphoneApiUrl = process.env.OPENPHONE_API_URL || 'https://api.openphone.com/v1';
        this.openphoneApiKey = process.env.OPENPHONE_API_KEY;
        this.openphoneNumber = process.env.OPENPHONE_PHONE_NUMBER;
        
        if (!this.openphoneApiKey || !this.openphoneNumber) {
            console.error('❌ SMS Service: Missing OpenPhone configuration');
        }
    }

    /**
     * Check rate limits before sending SMS
     * @param {string} phoneNumber - Target phone number
     * @returns {Object} - Rate limit check result
     */
    checkRateLimit(phoneNumber) {
        const normalizedPhone = getDbPhoneNumber(phoneNumber);
        if (!normalizedPhone) {
            return { allowed: false, error: 'Invalid phone number format' };
        }

        // Check per-number rate limit
        const phoneKey = `sms_rate_${normalizedPhone}`;
        const phoneCount = rateLimitCache.get(phoneKey) || 0;
        
        if (phoneCount >= MAX_SMS_PER_HOUR_PER_NUMBER) {
            return { 
                allowed: false, 
                error: `Rate limit exceeded for ${phoneNumber}. Maximum ${MAX_SMS_PER_HOUR_PER_NUMBER} SMS per hour per number.`,
                resetTime: rateLimitCache.getTtl(phoneKey)
            };
        }

        // Check total rate limit
        const totalKey = 'sms_rate_total';
        const totalCount = rateLimitCache.get(totalKey) || 0;
        
        if (totalCount >= MAX_SMS_PER_HOUR_TOTAL) {
            return { 
                allowed: false, 
                error: `Global SMS rate limit exceeded. Maximum ${MAX_SMS_PER_HOUR_TOTAL} SMS per hour.`,
                resetTime: rateLimitCache.getTtl(totalKey)
            };
        }

        return { allowed: true, phoneCount, totalCount };
    }

    /**
     * Update rate limit counters
     * @param {string} phoneNumber - Target phone number
     */
    updateRateLimit(phoneNumber) {
        const normalizedPhone = getDbPhoneNumber(phoneNumber);
        if (!normalizedPhone) return;

        const phoneKey = `sms_rate_${normalizedPhone}`;
        const totalKey = 'sms_rate_total';
        
        const phoneCount = rateLimitCache.get(phoneKey) || 0;
        const totalCount = rateLimitCache.get(totalKey) || 0;
        
        rateLimitCache.set(phoneKey, phoneCount + 1);
        rateLimitCache.set(totalKey, totalCount + 1);
    }

    /**
     * Send SMS via OpenPhone with comprehensive error handling
     * @param {string} phoneNumber - Target phone number
     * @param {string} message - SMS content
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} - Send result
     */
    async sendSMS(phoneNumber, message, options = {}) {
        const startTime = Date.now();
        
        try {
            // Validate inputs
            if (!message || message.trim().length === 0) {
                throw new Error('Message content is required');
            }

            if (message.length > 1600) {
                throw new Error('Message too long. Maximum 1600 characters allowed.');
            }

            const phoneValidation = validatePhoneNumber(phoneNumber);
            if (!phoneValidation.valid) {
                throw new Error(`Invalid phone number: ${phoneValidation.error}`);
            }

            const normalizedPhone = phoneValidation.normalized;

            // Check rate limits
            const rateLimitCheck = this.checkRateLimit(normalizedPhone);
            if (!rateLimitCheck.allowed) {
                throw new Error(rateLimitCheck.error);
            }

            // Check if API is configured
            if (!this.openphoneApiKey) {
                throw new Error('OpenPhone API key not configured');
            }

            console.log(`📱 Sending SMS to ${normalizedPhone}: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);

            // Send via OpenPhone API
            const response = await axios.post(`${this.openphoneApiUrl}/messages`, {
                to: [normalizedPhone],
                from: this.openphoneNumber,
                content: message.trim()
            }, {
                headers: {
                    'Authorization': this.openphoneApiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            });

            // Update rate limits on success
            this.updateRateLimit(normalizedPhone);

            const result = {
                success: true,
                messageId: response.data.id,
                phoneNumber: normalizedPhone,
                platform: 'openphone',
                deliveryChannel: 'sms',
                status: 'sent',
                timestamp: new Date(),
                processingTime: Date.now() - startTime,
                rateLimitStatus: {
                    phoneCount: rateLimitCheck.phoneCount + 1,
                    totalCount: rateLimitCheck.totalCount + 1
                }
            };

            console.log(`✅ SMS sent successfully: ${result.messageId}`);
            return result;

        } catch (error) {
            console.error(`❌ SMS send failed to ${phoneNumber}:`, {
                error: error.message,
                code: error.code,
                response: error.response?.data,
                processingTime: Date.now() - startTime
            });

            // Check if this is a retryable error
            const isRetryable = this.isRetryableError(error);

            const phoneValidation = validatePhoneNumber(phoneNumber);
            const normalizedPhoneForError = phoneValidation.valid ? phoneValidation.normalized : phoneNumber;
            
            return {
                success: false,
                error: error.message,
                errorCode: error.code,
                responseData: error.response?.data,
                phoneNumber: normalizedPhoneForError,
                platform: 'openphone',
                status: 'failed',
                timestamp: new Date(),
                processingTime: Date.now() - startTime,
                retryable: isRetryable
            };
        }
    }

    /**
     * Send SMS to customer or lead with automatic customer lookup
     * @param {string} customerId - Customer or Lead ID
     * @param {string} message - SMS content
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} - Send result with communication record
     */
    async sendSMSToCustomer(customerId, message, options = {}) {
        try {
            // Find customer or lead
            let customer = await Customer.findById(customerId) || await Lead.findById(customerId);
            if (!customer) {
                throw new Error('Customer/Lead not found');
            }

            const phoneNumber = options.phoneNumber || customer.phone;
            if (!phoneNumber) {
                throw new Error('No phone number available for customer');
            }

            // Send SMS
            const smsResult = await this.sendSMS(phoneNumber, message, options);

            // Create communication record
            const communication = new Communication({
                customer: customerId,
                type: 'sms',
                direction: 'outbound',
                body: message.trim(),
                from: {
                    name: 'TownRanker Team',
                    phone: this.openphoneNumber
                },
                to: [{
                    name: customer.name,
                    phone: phoneNumber
                }],
                status: smsResult.success ? 'sent' : 'failed',
                sentDate: new Date(),
                platform: 'openphone',
                deliveryChannel: 'sms',
                phoneNumber: phoneNumber,
                openphoneMessageId: smsResult.messageId || null,
                error: smsResult.success ? null : {
                    message: smsResult.error,
                    code: smsResult.errorCode,
                    date: new Date()
                },
                // Template metadata if provided
                templateUsed: options.templateUsed || null,
                isTemplateSegment: options.isSegment || false,
                segmentInfo: options.isSegment ? {
                    number: options.segmentNumber,
                    total: options.totalSegments
                } : null
            });

            await communication.save();

            // Update customer/lead
            if (smsResult.success) {
                customer.lastContactDate = new Date();
                if (customer.communications) {
                    customer.communications.push(communication._id);
                }
                await customer.save();
            }

            // Schedule retry if failed and retryable
            if (!smsResult.success && smsResult.retryable) {
                await this.scheduleRetry(customerId, message, options, communication._id);
            }

            return {
                ...smsResult,
                customerId: customerId,
                customerName: customer.name,
                communicationId: communication._id,
                communication: communication
            };

        } catch (error) {
            console.error('Error sending SMS to customer:', error);
            throw error;
        }
    }

    /**
     * Find or create lead for SMS contact
     * @param {string} phoneNumber - Phone number
     * @param {string} initialMessage - First message content
     * @returns {Promise<Object>} - Lead object
     */
    async findOrCreateSMSLead(phoneNumber, initialMessage = '') {
        const normalizedPhone = getDbPhoneNumber(phoneNumber);
        if (!normalizedPhone) {
            throw new Error('Invalid phone number format');
        }

        let lead = await Lead.findOne({ phone: normalizedPhone });

        if (!lead) {
            lead = new Lead({
                name: `SMS Contact ${normalizedPhone}`,
                email: `${normalizedPhone}@temp.sms`,
                phone: normalizedPhone,
                status: 'new',
                source: 'sms',
                message: initialMessage,
                engagementLevel: 'warm' // SMS contacts are typically warmer leads
            });
            await lead.save();
            console.log(`📱 Created new SMS lead: ${lead.name} (${phoneNumber})`);
        }

        return lead;
    }

    /**
     * Process incoming SMS webhook
     * @param {Object} webhookData - Webhook payload
     * @returns {Promise<Object>} - Processing result
     */
    async processIncomingSMS(webhookData) {
        try {
            const { id, from, to, text, createdAt, direction } = webhookData;

            if (direction !== 'incoming') {
                return { processed: false, reason: 'Not an incoming message' };
            }

            // Find or create lead
            const lead = await this.findOrCreateSMSLead(from, text);

            // Check for duplicate message
            const existingMessage = await Communication.findOne({
                openphoneMessageId: id
            });

            if (existingMessage) {
                console.log(`📱 Duplicate message detected: ${id}`);
                return { 
                    processed: false, 
                    reason: 'Duplicate message',
                    existingCommunicationId: existingMessage._id
                };
            }

            // Create communication record
            const communication = new Communication({
                customer: lead._id,
                type: 'sms',
                direction: 'inbound',
                body: text,
                from: {
                    name: lead.name,
                    phone: from
                },
                to: [{
                    name: 'TownRanker Team',
                    phone: to
                }],
                status: 'received',
                sentDate: new Date(createdAt),
                platform: 'openphone',
                deliveryChannel: 'sms',
                phoneNumber: from,
                openphoneMessageId: id
            });

            await communication.save();

            // Update lead
            lead.lastContactDate = new Date();
            if (lead.communications) {
                lead.communications.push(communication._id);
            }
            await lead.save();

            console.log(`📱 Processed incoming SMS from ${lead.name}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

            return {
                processed: true,
                leadId: lead._id,
                leadName: lead.name,
                communicationId: communication._id,
                messagePreview: text.substring(0, 100)
            };

        } catch (error) {
            console.error('Error processing incoming SMS:', error);
            throw error;
        }
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error object
     * @returns {boolean} - True if error is retryable
     */
    isRetryableError(error) {
        const retryableCodes = ['TIMEOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED'];
        const retryableMessages = ['timeout', 'network', 'connection', 'temporary'];
        
        if (retryableCodes.includes(error.code)) return true;
        
        const errorMessage = error.message.toLowerCase();
        return retryableMessages.some(msg => errorMessage.includes(msg));
    }

    /**
     * Schedule retry for failed SMS
     * @param {string} customerId - Customer ID
     * @param {string} message - Message content
     * @param {Object} options - Send options
     * @param {string} communicationId - Original communication ID
     */
    async scheduleRetry(customerId, message, options, communicationId) {
        const retryKey = `retry_${communicationId}`;
        const existingRetry = retryCache.get(retryKey) || { attempts: 0 };
        
        if (existingRetry.attempts >= MAX_RETRY_ATTEMPTS) {
            console.log(`📱 Max retry attempts reached for communication: ${communicationId}`);
            return;
        }

        const delay = RETRY_DELAYS[existingRetry.attempts] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        
        setTimeout(async () => {
            try {
                console.log(`📱 Retrying SMS send (attempt ${existingRetry.attempts + 1})`);
                const result = await this.sendSMSToCustomer(customerId, message, {
                    ...options,
                    isRetry: true,
                    originalCommunicationId: communicationId
                });

                if (result.success) {
                    retryCache.del(retryKey);
                    console.log(`✅ SMS retry successful: ${result.messageId}`);
                } else {
                    // Schedule next retry
                    retryCache.set(retryKey, { attempts: existingRetry.attempts + 1 });
                    await this.scheduleRetry(customerId, message, options, communicationId);
                }
            } catch (error) {
                console.error('SMS retry failed:', error);
                retryCache.set(retryKey, { attempts: existingRetry.attempts + 1 });
            }
        }, delay);

        console.log(`📱 SMS retry scheduled in ${delay / 1000}s (attempt ${existingRetry.attempts + 1}/${MAX_RETRY_ATTEMPTS})`);
    }

    /**
     * Get SMS delivery status from OpenPhone
     * @param {string} messageId - OpenPhone message ID
     * @returns {Promise<Object>} - Delivery status
     */
    async getDeliveryStatus(messageId) {
        try {
            const response = await axios.get(`${this.openphoneApiUrl}/messages/${messageId}`, {
                headers: {
                    'Authorization': this.openphoneApiKey
                }
            });

            return {
                success: true,
                status: response.data.status,
                deliveredAt: response.data.deliveredAt,
                failureReason: response.data.failureReason
            };

        } catch (error) {
            console.error('Error checking delivery status:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get SMS analytics and health status
     * @returns {Promise<Object>} - Analytics data
     */
    async getAnalytics() {
        try {
            const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            // Get SMS statistics
            const totalSent = await Communication.countDocuments({
                type: 'sms',
                direction: 'outbound',
                createdAt: { $gte: last24Hours }
            });

            const totalReceived = await Communication.countDocuments({
                type: 'sms',
                direction: 'inbound',
                createdAt: { $gte: last24Hours }
            });

            const failed = await Communication.countDocuments({
                type: 'sms',
                direction: 'outbound',
                status: 'failed',
                createdAt: { $gte: last24Hours }
            });

            const successRate = totalSent > 0 ? ((totalSent - failed) / totalSent * 100).toFixed(2) : 100;

            return {
                last24Hours: {
                    sent: totalSent,
                    received: totalReceived,
                    failed: failed,
                    successRate: `${successRate}%`
                },
                rateLimits: {
                    maxPerHourPerNumber: MAX_SMS_PER_HOUR_PER_NUMBER,
                    maxPerHourTotal: MAX_SMS_PER_HOUR_TOTAL
                },
                retrySettings: {
                    maxAttempts: MAX_RETRY_ATTEMPTS,
                    delaysMs: RETRY_DELAYS
                },
                configuration: {
                    hasApiKey: !!this.openphoneApiKey,
                    hasPhoneNumber: !!this.openphoneNumber,
                    apiUrl: this.openphoneApiUrl
                }
            };

        } catch (error) {
            console.error('Error getting SMS analytics:', error);
            return { error: error.message };
        }
    }
}

module.exports = new SMSService();