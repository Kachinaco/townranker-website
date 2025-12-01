const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const router = express.Router();
const Communication = require('../models/Communication');
const Customer = require('../models/Customer');

// Define Lead schema (should match server.js)
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

// Notification schema for SMS
const notificationSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['sms_sent', 'sms_received', 'customer_reply'],
        required: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    metadata: {
        messageContent: String,
        platform: String,
        deliveryChannel: String
    },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

// Helper function to create SMS notifications
async function createSMSNotification(type, lead, communication) {
    try {
        let title, message;
        
        switch (type) {
            case 'sms_sent':
                title = '📱 SMS Sent';
                message = `Message sent to ${lead.name}`;
                break;
            case 'customer_reply':
                title = '📱 SMS Reply Received';
                message = `${lead.name} replied via SMS`;
                break;
            default:
                title = '📱 SMS Activity';
                message = `SMS activity with ${lead.name}`;
        }

        const notification = new Notification({
            type,
            title,
            message,
            customerName: lead.name,
            customerPhone: lead.phone,
            leadId: lead._id,
            metadata: {
                messageContent: communication.body,
                platform: communication.platform,
                deliveryChannel: communication.deliveryChannel
            }
        });

        await notification.save();
        console.log(`📱 Notification created: ${title} for ${lead.name}`);
        return notification;
    } catch (error) {
        console.error('Error creating SMS notification:', error);
    }
}

// OpenPhone API Configuration
const OPENPHONE_API_URL = 'https://api.openphone.com/v1';
const API_KEY = process.env.OPENPHONE_API_KEY;
const PHONE_NUMBER = process.env.OPENPHONE_PHONE_NUMBER;

// Middleware to verify OpenPhone webhook
const verifyWebhook = (req, res, next) => {
    // Add webhook verification logic if OpenPhone provides it
    next();
};

// Send SMS via OpenPhone
router.post('/send', async (req, res) => {
    try {
        const { customerId, message, phoneNumber } = req.body;

        if (!message || !phoneNumber) {
            return res.status(400).json({ error: 'Message and phone number are required' });
        }

        // Get customer if customerId provided
        let customer = null;
        if (customerId) {
            customer = await Customer.findById(customerId);
            if (!customer) {
                return res.status(404).json({ error: 'Customer not found' });
            }
        }

        // Send message via OpenPhone API
        const response = await axios.post(`${OPENPHONE_API_URL}/messages`, {
            to: [phoneNumber],
            from: PHONE_NUMBER,
            content: message
        }, {
            headers: {
                'Authorization': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        // Create communication record
        const communication = new Communication({
            customer: customer ? customer._id : null,
            type: 'sms',
            direction: 'outbound',
            body: message,
            from: {
                name: 'TownRanker Team',
                phone: PHONE_NUMBER
            },
            to: [{
                name: customer ? customer.name : 'Unknown',
                phone: phoneNumber
            }],
            status: 'sent',
            sentDate: new Date(),
            platform: 'openphone',
            openphoneMessageId: response.data.id,
            phoneNumber: phoneNumber
        });

        await communication.save();

        // Update customer's last contact date
        if (customer) {
            customer.lastContactDate = new Date();
            customer.communications.push(communication._id);
            await customer.save();
        }

        // Create notification for sent SMS
        if (customer) {
            await createSMSNotification('sms_sent', customer, communication);
        }

        // Emit real-time event for chat interface
        if (req.app.get('io')) {
            req.app.get('io').emit('new_message', {
                customerId: customer ? customer._id : null,
                communication: communication,
                type: 'sms_sent'
            });
            
            req.app.get('io').emit('sms_notification', {
                type: 'sms_sent',
                leadId: customer ? customer._id : null,
                leadName: customer ? customer.name : 'Unknown',
                message: message,
                phone: phoneNumber
            });
        }

        res.json({
            success: true,
            messageId: response.data.id,
            communicationId: communication._id
        });

    } catch (error) {
        console.error('Error sending SMS:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to send message',
            details: error.response?.data || error.message 
        });
    }
});

// Receive incoming messages webhook
router.post('/webhook', verifyWebhook, async (req, res) => {
    try {
        console.log('📱 OpenPhone webhook received:', JSON.stringify(req.body, null, 2));
        
        const event = req.body;
        
        // OpenPhone webhook format: { id, object, type, data: { object: {...} } }
        if (!event || event.type !== 'message.received') {
            console.log('📤 Non-message webhook or not message.received, skipping...');
            return res.json({ success: true });
        }

        const message = event.data?.object;
        if (!message) {
            return res.status(400).json({ error: 'No message data in webhook payload' });
        }

        // Extract message details from OpenPhone webhook format
        const messageId = message.id;
        const fromNumber = message.from;
        const toNumber = Array.isArray(message.to) ? message.to[0] : message.to;
        const messageText = message.text;
        const messageDate = message.createdAt;
        const direction = message.direction;

        // Verify this is an incoming message
        if (direction !== 'incoming') {
            console.log('📤 Outgoing message webhook, skipping...');
            return res.json({ success: true });
        }

        // Handle different OpenPhone numbers for different systems
        const primaryOpenPhoneNumber = process.env.OPENPHONE_PHONE_NUMBER || '+19288325856';
        const windowsDoorsNumber = '+14809334392';
        
        // If message is for Windows & Doors CRM number, forward it
        if (toNumber === windowsDoorsNumber) {
            console.log(`📱 Forwarding SMS to Windows & Doors CRM: ${toNumber} from ${fromNumber}`);
            try {
                const axios = require('axios');
                await axios.post('http://5.78.81.114:3005/api/sms/webhook', req.body, {
                    headers: { 'Content-Type': 'application/json' }
                });
                console.log(`📱 Successfully forwarded SMS to Windows & Doors CRM`);
            } catch (forwardError) {
                console.error(`📱 Error forwarding SMS to Windows & Doors CRM:`, forwardError.message);
            }
            return res.json({ success: true });
        }
        
        // Only process messages sent to TownRanker's primary number
        if (toNumber !== primaryOpenPhoneNumber) {
            console.log(`📱 Message sent to ${toNumber}, but we only process messages to ${primaryOpenPhoneNumber}, skipping...`);
            return res.json({ success: true });
        }

        console.log(`📱 Processing incoming SMS from ${fromNumber}: "${messageText}"`);

        // Check if we already processed this message (prevent duplicates)
        const existingMessage = await Communication.findOne({ 
            openphoneMessageId: messageId 
        });
        
        if (existingMessage) {
            console.log(`📱 Message ${messageId} already processed, skipping duplicate`);
            return res.json({ success: true });
        }

        // Normalize phone number to match existing leads (10 digits without country code)
        const normalizedPhone = fromNumber.replace(/\D/g, '').replace(/^1/, ''); // Remove +1 country code
        
        // Find lead by phone number (using Lead model since that's what admin dashboard uses)
        const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);
        let lead = await Lead.findOne({ phone: normalizedPhone });
        
        // If lead not found, create a new lead
        if (!lead) {
            lead = new Lead({
                name: `Lead from ${fromNumber}`,
                email: `${normalizedPhone}@temp.com`,
                phone: normalizedPhone,
                status: 'new',
                source: 'sms',
                message: messageText
            });
            await lead.save();
            console.log(`📱 Created new lead from SMS: ${lead.name} (${fromNumber})`);
        }

        // Create communication record
        const communication = new Communication({
            customer: lead._id, // Using lead ID in customer field
            type: 'sms',
            direction: 'inbound',
            body: messageText,
            from: {
                name: lead.name,
                phone: fromNumber
            },
            to: [{
                name: 'TownRanker Team',
                phone: toNumber
            }],
            status: 'replied',
            sentDate: new Date(messageDate),
            platform: 'openphone',
            openphoneMessageId: messageId,
            phoneNumber: fromNumber,
            deliveryChannel: 'sms'
        });

        await communication.save();
        console.log(`📱 SMS received from ${lead.name}: "${messageText}"`);

        // Create notification like email system
        await createSMSNotification('customer_reply', lead, communication);

        // Emit real-time event for chat interface
        if (req.app.get('io')) {
            req.app.get('io').emit('new_message', {
                customerId: lead._id,
                communication: communication,
                type: 'sms_received'
            });
            
            req.app.get('io').emit('sms_notification', {
                type: 'customer_reply',
                leadId: lead._id,
                leadName: lead.name,
                message: messageText,
                phone: fromNumber
            });
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
});

// Get conversation history for a customer
router.get('/conversation/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const communications = await Communication.find({
            customer: customerId,
            type: 'sms'
        })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .exec();

        res.json({
            success: true,
            customer: {
                id: customer._id,
                name: customer.name,
                phone: customer.phone
            },
            messages: communications.reverse(), // Reverse to show oldest first
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: await Communication.countDocuments({
                    customer: customerId,
                    type: 'sms'
                })
            }
        });

    } catch (error) {
        console.error('Error fetching conversation:', error);
        res.status(500).json({ error: 'Failed to fetch conversation' });
    }
});

// Get message delivery status
router.get('/status/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;

        // Check OpenPhone API for delivery status
        const response = await axios.get(`${OPENPHONE_API_URL}/messages/${messageId}`, {
            headers: {
                'Authorization': API_KEY
            }
        });

        // Update local communication record
        const communication = await Communication.findOne({ 
            openphoneMessageId: messageId 
        });

        if (communication) {
            communication.status = response.data.status || communication.status;
            if (response.data.deliveredAt) {
                communication.deliveredDate = new Date(response.data.deliveredAt);
            }
            await communication.save();
        }

        res.json({
            success: true,
            status: response.data.status,
            communication: communication
        });

    } catch (error) {
        console.error('Error checking message status:', error);
        res.status(500).json({ error: 'Failed to check message status' });
    }
});

// Get OpenPhone phone numbers
router.get('/numbers', async (req, res) => {
    try {
        console.log('Fetching OpenPhone numbers...');
        console.log('API URL:', OPENPHONE_API_URL);
        console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 10)}...` : 'Not set');
        
        const response = await axios.get(`${OPENPHONE_API_URL}/phone-numbers`, {
            headers: {
                'Authorization': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        console.log('OpenPhone response:', response.data);

        res.json({
            success: true,
            phoneNumbers: response.data
        });

    } catch (error) {
        console.error('Error fetching phone numbers:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to fetch phone numbers',
            details: error.response?.data || error.message,
            apiUrl: OPENPHONE_API_URL,
            hasApiKey: !!API_KEY
        });
    }
});

module.exports = router;