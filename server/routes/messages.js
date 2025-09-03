const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const messageRouter = require('../services/messageRouter');
const Communication = require('../models/Communication');
const Customer = require('../models/Customer');

// Import Lead model from server.js (we'll define it here for now)
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

// Helper function for relative time formatting
function getRelativeTime(date) {
    const now = new Date();
    const messageDate = new Date(date);
    const diffMs = now - messageDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return messageDate.toLocaleDateString();
}

// Send message through intelligent routing
router.post('/send', async (req, res) => {
    try {
        const { customerId, message, phoneNumber } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!customerId && !phoneNumber) {
            return res.status(400).json({ error: 'Customer ID or phone number is required' });
        }

        let result;
        
        if (customerId) {
            // First try to find as Lead (most likely)
            let lead = await Lead.findById(customerId);
            if (lead) {
                result = await messageRouter.sendMessageToLead(customerId, message, { phoneNumber: phoneNumber || lead.phone });
            } else {
                // Fallback to Customer model
                let customer = await Customer.findById(customerId);
                if (customer) {
                    result = await messageRouter.sendMessage(customerId, message, { phoneNumber });
                } else {
                    return res.status(404).json({ error: 'Lead/Customer not found' });
                }
            }
        } else {
            // Send to phone number (may create new lead)
            let lead = await Lead.findOne({ phone: phoneNumber });
            
            if (!lead) {
                // Create new lead
                lead = new Lead({
                    name: `Lead from ${phoneNumber}`,
                    email: `${phoneNumber.replace(/\D/g, '')}@temp.com`,
                    phone: phoneNumber,
                    status: 'new',
                    source: 'direct_message'
                });
                await lead.save();
            }
            
            result = await messageRouter.sendMessageToLead(lead._id, message);
        }

        res.json({
            success: true,
            communication: result.communication,
            deliveryChannel: result.deliveryChannel,
            platform: result.platform
        });

        // Create notification for sent SMS
        if (customerId) {
            let lead = await Lead.findById(customerId);
            if (lead && result.communication) {
                await createSMSNotification('sms_sent', lead, result.communication);
            }
        }

        // Emit real-time event
        if (req.app.get('io')) {
            req.app.get('io').emit('new_message', {
                customerId: result.communication.customer,
                communication: result.communication,
                type: 'sms_sent'
            });
            
            req.app.get('io').emit('sms_notification', {
                type: 'sms_sent',
                leadId: result.communication.customer,
                leadName: result.communication.to[0]?.name || 'Customer',
                message: message,
                phone: result.communication.phoneNumber
            });
        }

    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ 
            error: 'Failed to send message',
            details: error.message 
        });
    }
});

// Get conversation history (supports both SMS and iMessage)
router.get('/conversation/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        // Try to find as Lead first, then Customer
        let customer = await Lead.findById(customerId);
        if (!customer) {
            customer = await Customer.findById(customerId);
        }
        if (!customer) {
            return res.status(404).json({ error: 'Customer/Lead not found' });
        }

        // Get SMS conversation with proper timestamps and formatting
        const messages = await Communication.find({
            customer: customerId,
            type: 'sms'
        })
        .sort({ createdAt: 1 }) // Oldest first for conversation flow
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean()
        .exec();

        // Format messages with proper timestamps
        const formattedMessages = messages.map(msg => ({
            ...msg,
            timestamp: msg.createdAt,
            formattedTime: new Date(msg.createdAt).toLocaleString(),
            relativeTime: getRelativeTime(msg.createdAt),
            isRecent: (Date.now() - new Date(msg.createdAt).getTime()) < (24 * 60 * 60 * 1000) // Last 24 hours
        }));

        const total = await Communication.countDocuments({
            customer: customerId,
            type: 'sms'
        });

        // Get customer/lead info
        let customerInfo;
        const lead = await Lead.findById(customerId);
        if (lead) {
            customerInfo = {
                id: lead._id,
                name: lead.name,
                phone: lead.phone,
                email: lead.email,
                source: lead.source,
                status: lead.status,
                canReceiveImessage: false // Will be determined later
            };
        } else {
            const customer = await Customer.findById(customerId);
            customerInfo = customer ? {
                id: customer._id,
                name: customer.name,
                phone: customer.phone,
                email: customer.email,
                canReceiveImessage: customer.customFields?.canReceiveImessage || false
            } : null;
        }

        res.json({
            success: true,
            customer: customerInfo,
            messages: formattedMessages,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                hasMore: (page * limit) < total
            },
            conversationStats: {
                totalMessages: total,
                sentByUs: await Communication.countDocuments({ customer: customerId, type: 'sms', direction: 'outbound' }),
                receivedFromCustomer: await Communication.countDocuments({ customer: customerId, type: 'sms', direction: 'inbound' }),
                lastActivity: messages.length > 0 ? messages[messages.length - 1].createdAt : null
            }
        });

    } catch (error) {
        console.error('Error fetching conversation:', error);
        res.status(500).json({ error: 'Failed to fetch conversation' });
    }
});

// Update message status
router.put('/status/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { status } = req.body;

        const communication = await Communication.findById(messageId);
        if (!communication) {
            return res.status(404).json({ error: 'Message not found' });
        }

        communication.status = status;
        
        if (status === 'delivered') {
            communication.deliveredDate = new Date();
        }

        await communication.save();

        res.json({
            success: true,
            message: communication
        });

        // Emit real-time status update
        if (req.app.get('io')) {
            req.app.get('io').emit('message_status_update', {
                customerId: communication.customer,
                messageId: messageId,
                status: status
            });
        }

    } catch (error) {
        console.error('Error updating message status:', error);
        res.status(500).json({ error: 'Failed to update message status' });
    }
});

// Search messages
router.get('/search', async (req, res) => {
    try {
        const { query, customerId, type = 'sms', page = 1, limit = 20 } = req.query;

        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const searchFilter = {
            type: type,
            body: { $regex: query, $options: 'i' }
        };

        if (customerId) {
            searchFilter.customer = customerId;
        }

        const messages = await Communication.find(searchFilter)
            .populate('customer', 'name phone email')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        const total = await Communication.countDocuments(searchFilter);

        res.json({
            success: true,
            messages: messages,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total
            }
        });

    } catch (error) {
        console.error('Error searching messages:', error);
        res.status(500).json({ error: 'Failed to search messages' });
    }
});

// Get message statistics
router.get('/stats/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;

        const stats = await Communication.aggregate([
            { $match: { customer: mongoose.Types.ObjectId(customerId), type: 'sms' } },
            {
                $group: {
                    _id: null,
                    totalMessages: { $sum: 1 },
                    sentMessages: { $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] } },
                    receivedMessages: { $sum: { $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0] } },
                    imessageCount: { $sum: { $cond: [{ $eq: ['$deliveryChannel', 'imessage'] }, 1, 0] } },
                    smsCount: { $sum: { $cond: [{ $eq: ['$deliveryChannel', 'sms'] }, 1, 0] } },
                    lastMessageDate: { $max: '$createdAt' },
                    firstMessageDate: { $min: '$createdAt' }
                }
            }
        ]);

        res.json({
            success: true,
            stats: stats[0] || {
                totalMessages: 0,
                sentMessages: 0,
                receivedMessages: 0,
                imessageCount: 0,
                smsCount: 0,
                lastMessageDate: null,
                firstMessageDate: null
            }
        });

    } catch (error) {
        console.error('Error fetching message stats:', error);
        res.status(500).json({ error: 'Failed to fetch message statistics' });
    }
});

// Webhook for iMessage (BlueBubbles)
router.post('/webhook/imessage', async (req, res) => {
    try {
        const messageData = req.body;
        
        // Process incoming iMessage
        const result = await messageRouter.processIncomingMessage(messageData, 'bluebubbles');

        res.json({ success: true });

        // Emit real-time event
        if (req.app.get('io')) {
            req.app.get('io').emit('new_message', {
                customerId: result.customer._id,
                communication: result.communication
            });
        }

    } catch (error) {
        console.error('Error processing iMessage webhook:', error);
        res.status(500).json({ error: 'Failed to process iMessage webhook' });
    }
});

// Test iMessage availability for a phone number
router.get('/imessage-test/:phoneNumber', async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        
        const canReceiveImessage = await messageRouter.checkImessageAvailability(phoneNumber);
        
        res.json({
            success: true,
            phoneNumber: phoneNumber,
            canReceiveImessage: canReceiveImessage
        });

    } catch (error) {
        console.error('Error testing iMessage availability:', error);
        res.status(500).json({ error: 'Failed to test iMessage availability' });
    }
});

module.exports = router;