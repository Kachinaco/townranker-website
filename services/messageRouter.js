const axios = require('axios');
const mongoose = require('mongoose');
const NodeCache = require('node-cache');
const Communication = require('../models/Communication');
const Customer = require('../models/Customer');

// Define Lead schema (matching server.js)
const leadSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    projectType: { type: String },
    budget: { type: Number, default: 0 },
    timeline: { type: String },
    features: [{ type: String }],
    company: { type: String },
    message: { type: String },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    status: { type: String, enum: ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed', 'lost'], default: 'new' },
    source: { type: String, default: 'website' },
    notes: [{ content: String, createdAt: { type: Date, default: Date.now } }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

// Cache for iMessage availability (1 hour TTL)
const imessageCache = new NodeCache({ stdTTL: 3600 });

class MessageRouter {
    constructor() {
        this.openphoneApiUrl = 'https://api.openphone.com/v1';
        this.openphoneApiKey = process.env.OPENPHONE_API_KEY;
        this.openphoneNumber = process.env.OPENPHONE_PHONE_NUMBER;
        this.blueBubblesUrl = process.env.BLUEBUBBLES_SERVER_URL;
        this.blueBubblesPassword = process.env.BLUEBUBBLES_PASSWORD;
        this.enableImessage = process.env.ENABLE_IMESSAGE === 'true';
        this.preferImessage = process.env.PREFER_IMESSAGE === 'true';
    }

    /**
     * Check if a phone number can receive iMessage
     * @param {string} phoneNumber - Phone number to check
     * @returns {Promise<boolean>} - True if can receive iMessage
     */
    async checkImessageAvailability(phoneNumber) {
        if (!this.enableImessage) return false;

        // Check cache first
        const cacheKey = `imessage_${phoneNumber}`;
        const cached = imessageCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        try {
            // Check with BlueBubbles server
            const response = await axios.get(`${this.blueBubblesUrl}/api/v1/contact/${phoneNumber}/imessage`, {
                headers: {
                    'Authorization': `Bearer ${this.blueBubblesPassword}`
                },
                timeout: 5000
            });

            const canReceiveImessage = response.data?.available || false;
            
            // Cache result
            imessageCache.set(cacheKey, canReceiveImessage);
            
            return canReceiveImessage;
        } catch (error) {
            console.warn(`Could not check iMessage availability for ${phoneNumber}:`, error.message);
            
            // Cache negative result for shorter time
            imessageCache.set(cacheKey, false, 300); // 5 minutes
            return false;
        }
    }

    /**
     * Send message via OpenPhone SMS
     * @param {string} phoneNumber - Recipient phone number
     * @param {string} message - Message text
     * @param {string} customerId - Customer ID (optional)
     * @returns {Promise<Object>} - Result object
     */
    async sendViaOpenPhone(phoneNumber, message, customerId = null) {
        try {
            // Ensure phone number has + prefix for international format
            const formattedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber}`;
            
            const response = await axios.post(`${this.openphoneApiUrl}/messages`, {
                to: [formattedPhoneNumber],
                from: this.openphoneNumber,
                content: message
            }, {
                headers: {
                    'Authorization': this.openphoneApiKey,
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                platform: 'openphone',
                messageId: response.data.id,
                deliveryChannel: 'sms',
                status: 'sent'
            };

        } catch (error) {
            console.error('OpenPhone send error:', error.response?.data || error.message);
            console.error('Request data was:', {
                to: [phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber}`],
                from: this.openphoneNumber,
                content: message
            });
            console.error('Headers were:', {
                'Authorization': this.openphoneApiKey ? 'Present' : 'Missing',
                'Content-Type': 'application/json'
            });
            throw new Error(`Failed to send via OpenPhone: ${JSON.stringify(error.response?.data || error.message)}`);
        }
    }

    /**
     * Send message via iMessage (BlueBubbles)
     * @param {string} phoneNumber - Recipient phone number
     * @param {string} message - Message text
     * @param {string} customerId - Customer ID (optional)
     * @returns {Promise<Object>} - Result object
     */
    async sendViaImessage(phoneNumber, message, customerId = null) {
        try {
            const response = await axios.post(`${this.blueBubblesUrl}/api/v1/message/text`, {
                chatGuid: phoneNumber,
                message: message,
                tempGuid: `temp_${Date.now()}`
            }, {
                headers: {
                    'Authorization': `Bearer ${this.blueBubblesPassword}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            return {
                success: true,
                platform: 'bluebubbles',
                messageId: response.data.data?.guid,
                deliveryChannel: 'imessage',
                status: 'sent'
            };

        } catch (error) {
            console.error('iMessage send error:', error.response?.data || error.message);
            throw new Error(`Failed to send via iMessage: ${error.message}`);
        }
    }

    /**
     * Intelligent message routing
     * @param {string} customerId - Customer ID
     * @param {string} message - Message text
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} - Result object with communication record
     */
    async sendMessage(customerId, message, options = {}) {
        try {
            // Get customer
            const customer = await Customer.findById(customerId);
            if (!customer) {
                throw new Error('Customer not found');
            }

            const phoneNumber = options.phoneNumber || customer.phone;
            if (!phoneNumber) {
                throw new Error('No phone number available');
            }

            let result;
            let attemptedImessage = false;

            // Determine best delivery method
            if (this.enableImessage && this.preferImessage) {
                try {
                    const canReceiveImessage = await this.checkImessageAvailability(phoneNumber);
                    
                    if (canReceiveImessage) {
                        attemptedImessage = true;
                        result = await this.sendViaImessage(phoneNumber, message, customerId);
                        
                        // Update customer iMessage status
                        await Customer.findByIdAndUpdate(customerId, { 
                            'customFields.canReceiveImessage': true,
                            'customFields.lastImessageCheck': new Date()
                        });
                    }
                } catch (imessageError) {
                    console.warn(`iMessage failed for ${phoneNumber}, falling back to SMS:`, imessageError.message);
                }
            }

            // Fallback to SMS if iMessage failed or not available
            if (!result) {
                result = await this.sendViaOpenPhone(phoneNumber, message, customerId);
                
                if (attemptedImessage) {
                    // Update customer iMessage status to false
                    await Customer.findByIdAndUpdate(customerId, { 
                        'customFields.canReceiveImessage': false,
                        'customFields.lastImessageCheck': new Date()
                    });
                }
            }

            // Create communication record
            const communication = new Communication({
                customer: customerId,
                type: 'sms',
                direction: 'outbound',
                body: message,
                from: {
                    name: 'TownRanker Team',
                    phone: this.openphoneNumber
                },
                to: [{
                    name: customer.name,
                    phone: phoneNumber
                }],
                status: result.status,
                sentDate: new Date(),
                platform: result.platform,
                deliveryChannel: result.deliveryChannel,
                phoneNumber: phoneNumber,
                isIphone: result.deliveryChannel === 'imessage',
                openphoneMessageId: result.platform === 'openphone' ? result.messageId : null,
                imessageId: result.platform === 'bluebubbles' ? result.messageId : null
            });

            await communication.save();

            // Update customer
            customer.lastContactDate = new Date();
            customer.communications.push(communication._id);
            await customer.save();

            return {
                success: true,
                communication: communication,
                deliveryChannel: result.deliveryChannel,
                platform: result.platform
            };

        } catch (error) {
            console.error('Message routing error:', error);
            throw error;
        }
    }

    /**
     * Process incoming message (from webhook)
     * @param {Object} messageData - Message data from webhook
     * @param {string} platform - Platform ('openphone' or 'bluebubbles')
     * @returns {Promise<Object>} - Result object
     */
    async processIncomingMessage(messageData, platform) {
        try {
            let phoneNumber, message, messageId, timestamp;

            if (platform === 'openphone') {
                phoneNumber = messageData.from;
                message = messageData.text;
                messageId = messageData.id;
                timestamp = messageData.createdAt;
            } else if (platform === 'bluebubbles') {
                phoneNumber = messageData.handle;
                message = messageData.text;
                messageId = messageData.guid;
                timestamp = messageData.dateCreated;
            }

            // Find or create customer
            let customer = await Customer.findOne({ phone: phoneNumber });
            
            if (!customer) {
                customer = new Customer({
                    name: `Lead from ${phoneNumber}`,
                    email: `${phoneNumber.replace(/\D/g, '')}@temp.com`,
                    phone: phoneNumber,
                    status: 'lead',
                    source: platform === 'bluebubbles' ? 'imessage' : 'sms',
                    initialMessage: message
                });
                await customer.save();
            }

            // Create communication record
            const communication = new Communication({
                customer: customer._id,
                type: 'sms',
                direction: 'inbound',
                body: message,
                from: {
                    name: customer.name,
                    phone: phoneNumber
                },
                to: [{
                    name: 'TownRanker Team',
                    phone: this.openphoneNumber
                }],
                status: 'received',
                sentDate: new Date(timestamp),
                platform: platform,
                deliveryChannel: platform === 'bluebubbles' ? 'imessage' : 'sms',
                phoneNumber: phoneNumber,
                isIphone: platform === 'bluebubbles',
                openphoneMessageId: platform === 'openphone' ? messageId : null,
                imessageId: platform === 'bluebubbles' ? messageId : null
            });

            await communication.save();

            // Update customer
            customer.lastContactDate = new Date();
            customer.communications.push(communication._id);
            await customer.save();

            return {
                success: true,
                customer: customer,
                communication: communication
            };

        } catch (error) {
            console.error('Error processing incoming message:', error);
            throw error;
        }
    }

    /**
     * Send message to a Lead (similar to sendMessage but for Lead model)
     * @param {string} leadId - Lead ID
     * @param {string} message - Message text
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} - Result object with communication record
     */
    async sendMessageToLead(leadId, message, options = {}) {
        try {
            // Get lead
            const lead = await Lead.findById(leadId);
            if (!lead) {
                throw new Error('Lead not found');
            }

            const phoneNumber = options.phoneNumber || lead.phone;
            if (!phoneNumber) {
                throw new Error('No phone number available');
            }

            let result;
            let attemptedImessage = false;

            // Determine best delivery method
            if (this.enableImessage && this.preferImessage) {
                try {
                    const canReceiveImessage = await this.checkImessageAvailability(phoneNumber);
                    
                    if (canReceiveImessage) {
                        attemptedImessage = true;
                        result = await this.sendViaImessage(phoneNumber, message, leadId);
                    }
                } catch (imessageError) {
                    console.warn(`iMessage failed for ${phoneNumber}, falling back to SMS:`, imessageError.message);
                }
            }

            // Fallback to SMS if iMessage failed or not available
            if (!result) {
                result = await this.sendViaOpenPhone(phoneNumber, message, leadId);
            }

            // Create communication record (linked to lead via leadId)
            const communication = new Communication({
                customer: leadId, // We'll use the same field but it's actually a leadId
                type: 'sms',
                direction: 'outbound',
                body: message,
                from: {
                    name: 'TownRanker Team',
                    phone: this.openphoneNumber
                },
                to: [{
                    name: lead.name,
                    phone: phoneNumber
                }],
                status: result.status,
                sentDate: new Date(),
                platform: result.platform,
                deliveryChannel: result.deliveryChannel,
                phoneNumber: phoneNumber,
                isIphone: result.deliveryChannel === 'imessage',
                openphoneMessageId: result.platform === 'openphone' ? result.messageId : null,
                imessageId: result.platform === 'bluebubbles' ? result.messageId : null
            });

            await communication.save();

            return {
                success: true,
                communication: communication,
                deliveryChannel: result.deliveryChannel,
                platform: result.platform
            };

        } catch (error) {
            console.error('Message routing error for lead:', error);
            throw error;
        }
    }

    /**
     * Get conversation history with mixed SMS/iMessage
     * @param {string} customerId - Customer ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} - Array of messages
     */
    async getConversation(customerId, options = {}) {
        const { page = 1, limit = 50 } = options;

        const messages = await Communication.find({
            customer: customerId,
            type: 'sms'
        })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean()
        .exec();

        return messages.reverse(); // Show oldest first
    }
}

module.exports = new MessageRouter();