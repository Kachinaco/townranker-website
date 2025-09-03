#!/usr/bin/env node

/**
 * OpenPhone Webhook Test Utility
 * 
 * This script helps test the OpenPhone webhook endpoint by sending test payloads
 * Usage: node scripts/test-webhook.js [options]
 */

const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// Configuration
const BASE_URL = process.env.BASE_URL || 'https://townranker.com';
const WEBHOOK_SECRET = process.env.OPENPHONE_WEBHOOK_SECRET;
const PHONE_NUMBER = process.env.OPENPHONE_PHONE_NUMBER || '+19288325856';

// Test payloads
const TEST_PAYLOADS = {
    message_received: {
        id: 'evt_test_' + Date.now(),
        object: 'event',
        type: 'message.received',
        created: Math.floor(Date.now() / 1000),
        data: {
            object: {
                id: 'msg_test_' + Date.now(),
                object: 'message',
                from: '+1234567890',
                to: PHONE_NUMBER,
                text: 'Test message from webhook test script',
                direction: 'incoming',
                createdAt: new Date().toISOString(),
                phoneNumberId: 'PN6guvaY6r'
            }
        }
    },
    
    message_sent: {
        id: 'evt_test_' + Date.now(),
        object: 'event',
        type: 'message.sent',
        created: Math.floor(Date.now() / 1000),
        data: {
            object: {
                id: 'msg_test_' + Date.now(),
                object: 'message',
                from: PHONE_NUMBER,
                to: '+1234567890',
                text: 'Test outbound message',
                direction: 'outgoing',
                createdAt: new Date().toISOString(),
                phoneNumberId: 'PN6guvaY6r'
            }
        }
    }
};

// Generate OpenPhone webhook signature
function generateSignature(payload, secret, timestamp = null) {
    if (!secret) {
        console.warn('⚠️ No webhook secret provided - signature verification will be skipped');
        return null;
    }
    
    const ts = timestamp || Date.now();
    const data = ts + '.' + JSON.stringify(payload);
    const hash = crypto
        .createHmac('sha256', Buffer.from(secret, 'base64'))
        .update(data)
        .digest('base64');
    
    return `hmac;1;${ts};${hash}`;
}

// Send test webhook
async function sendTestWebhook(payloadType, options = {}) {
    const payload = TEST_PAYLOADS[payloadType];
    if (!payload) {
        throw new Error(`Unknown payload type: ${payloadType}`);
    }
    
    const webhookUrl = `${BASE_URL}/api/openphone/webhook`;
    const timestamp = Date.now();
    
    // Generate signature
    let signature = null;
    if (options.invalidSignature) {
        signature = 'hmac;1;' + timestamp + ';invalid_signature_hash';
    } else if (WEBHOOK_SECRET) {
        signature = generateSignature(payload, WEBHOOK_SECRET, timestamp);
    }
    
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'OpenPhone-Webhook-Test/1.0'
    };
    
    if (signature) {
        headers['openphone-signature'] = signature;
    }
    
    console.log(`📤 Sending ${payloadType} webhook to ${webhookUrl}`);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    if (signature) {
        console.log('Signature:', signature.substring(0, 50) + '...');
    }
    
    try {
        const response = await axios.post(webhookUrl, payload, { headers });
        
        console.log('✅ Webhook sent successfully');
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2));
        
        return response;
        
    } catch (error) {
        console.error('❌ Webhook failed');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
        throw error;
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log('OpenPhone Webhook Test Utility');
        console.log('Usage: node scripts/test-webhook.js [payload-type]');
        process.exit(0);
    }
    
    const payloadType = args[0] || 'message_received';
    sendTestWebhook(payloadType)
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = {
    sendTestWebhook,
    generateSignature,
    TEST_PAYLOADS
};