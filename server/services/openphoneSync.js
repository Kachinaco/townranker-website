const axios = require('axios');
const mongoose = require('mongoose');
const Communication = require('../models/Communication');

// Use existing Lead model from server
const Lead = mongoose.models.Lead;

class OpenPhoneSync {
    constructor() {
        this.apiUrl = 'https://api.openphone.com/v1';
        this.apiKey = process.env.OPENPHONE_API_KEY;
        this.phoneNumber = process.env.OPENPHONE_PHONE_NUMBER;
        this.phoneNumberId = 'PNfOUIvv5X'; // OpenPhone number ID from webhooks
        this.lastSyncTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Start from 24 hours ago
        this.io = null; // Will be set by server
    }

    setSocketIO(io) {
        this.io = io;
    }

    async syncRecentMessages() {
        try {
            console.log('🔄 Syncing OpenPhone messages...');
            
            // Get conversations first
            const convResponse = await axios.get(`${this.apiUrl}/conversations`, {
                headers: {
                    'Authorization': this.apiKey,
                    'Content-Type': 'application/json'
                },
                params: {
                    phoneNumberId: this.phoneNumberId,
                    limit: 20
                }
            });

            const conversations = convResponse.data.data || [];
            console.log(`📱 Found ${conversations.length} conversations to check`);

            // For each conversation, check if it has new messages
            for (const conversation of conversations) {
                if (conversation.lastActivityAt && new Date(conversation.lastActivityAt) > this.lastSyncTime) {
                    // This conversation has new activity
                    await this.syncConversationMessages(conversation);
                }
            }

            // Update last sync time
            this.lastSyncTime = new Date();
            console.log('✅ OpenPhone sync completed');

        } catch (error) {
            console.error('❌ OpenPhone sync error:', error.message);
        }
    }

    async syncConversationMessages(conversation) {
        try {
            // Get messages for this conversation using the proper endpoint
            // Note: OpenPhone API doesn't have a direct messages endpoint that works
            // We'll need to use webhooks for real-time updates instead
            console.log(`📱 Checking conversation with ${conversation.participants[0]}`);
            
            // For now, we'll rely on webhooks for message updates
            // The sync will mainly be used to ensure we have all conversations tracked
            
        } catch (error) {
            console.error('❌ Error syncing conversation messages:', error);
        }
    }

    async processMessage(message) {
        try {
            // Check if we already have this message
            const existing = await Communication.findOne({ 
                openphoneMessageId: message.id 
            });

            if (existing) {
                return; // Already synced
            }

            // Normalize phone numbers
            const fromPhone = this.normalizePhoneNumber(message.from);
            const toPhone = this.normalizePhoneNumber(message.to);

            // Determine if this is outbound (from our OpenPhone number) or inbound
            const isOutbound = message.from === this.phoneNumber;
            
            let lead;
            let customerPhone;
            let direction;

            if (isOutbound) {
                // Outbound message - find lead by 'to' phone number
                customerPhone = this.normalizePhoneNumber(message.to);
                direction = 'outbound';
            } else {
                // Inbound message - find lead by 'from' phone number  
                customerPhone = this.normalizePhoneNumber(message.from);
                direction = 'inbound';
            }

            // Find or create lead
            lead = await Lead.findOne({ phone: customerPhone });
            
            if (!lead) {
                lead = new Lead({
                    name: `Lead from +1${customerPhone}`,
                    email: `${customerPhone}@temp.com`,
                    phone: customerPhone,
                    status: 'new',
                    source: 'sms',
                    message: message.text
                });
                await lead.save();
                console.log(`📱 Created new lead from sync: ${lead.name}`);
            }

            // Create communication record
            const communication = new Communication({
                customer: lead._id,
                type: 'sms',
                direction: direction,
                body: message.text,
                from: {
                    name: isOutbound ? 'TownRanker Team' : lead.name,
                    phone: message.from
                },
                to: [{
                    name: isOutbound ? lead.name : 'TownRanker Team',
                    phone: message.to
                }],
                status: direction === 'outbound' ? 'sent' : 'replied',
                sentDate: new Date(message.createdAt),
                platform: 'openphone',
                openphoneMessageId: message.id,
                phoneNumber: customerPhone,
                deliveryChannel: 'sms'
            });

            await communication.save();

            console.log(`📱 Synced ${direction} message: "${message.text}" (${lead.name})`);

            // Emit real-time event if socket.io available
            if (this.io) {
                this.io.emit('new_message', {
                    customerId: lead._id,
                    communication: communication,
                    type: direction === 'outbound' ? 'sms_sent' : 'sms_received'
                });
            }

        } catch (error) {
            console.error('❌ Error processing synced message:', error);
        }
    }

    normalizePhoneNumber(phone) {
        if (!phone) return '';
        // Remove all non-digits and remove leading +1
        return phone.replace(/\D/g, '').replace(/^1/, '');
    }

    startPeriodicSync(intervalMinutes = 5) {
        console.log(`🔄 Starting OpenPhone sync every ${intervalMinutes} minutes`);
        
        // Initial sync
        this.syncRecentMessages();
        
        // Set up periodic sync
        this.syncInterval = setInterval(() => {
            this.syncRecentMessages();
        }, intervalMinutes * 60 * 1000);
    }

    stopPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('🔄 OpenPhone sync stopped');
        }
    }
}

module.exports = new OpenPhoneSync();