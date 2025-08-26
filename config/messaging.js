module.exports = {
    openphone: {
        apiUrl: process.env.OPENPHONE_API_URL || 'https://api.openphone.co/v1',
        apiKey: process.env.OPENPHONE_API_KEY,
        phoneNumber: process.env.OPENPHONE_PHONE_NUMBER,
        webhookSecret: process.env.OPENPHONE_WEBHOOK_SECRET
    },
    
    bluebubbles: {
        serverUrl: process.env.BLUEBUBBLES_SERVER_URL,
        password: process.env.BLUEBUBBLES_PASSWORD,
        enabled: process.env.ENABLE_IMESSAGE === 'true'
    },
    
    features: {
        enableImessage: process.env.ENABLE_IMESSAGE === 'true',
        preferImessage: process.env.PREFER_IMESSAGE === 'true',
        maxMessageLength: 1600,
        cacheTimeout: 3600 // 1 hour in seconds
    },
    
    validation: {
        required: ['OPENPHONE_API_KEY', 'OPENPHONE_PHONE_NUMBER'],
        optional: ['BLUEBUBBLES_SERVER_URL', 'BLUEBUBBLES_PASSWORD']
    }
};