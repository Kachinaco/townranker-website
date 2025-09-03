const mongoose = require('mongoose');

const webhookLogSchema = new mongoose.Schema({
    // Webhook identification
    provider: {
        type: String,
        required: true,
        enum: ['openphone', 'stripe', 'twilio', 'other'],
        index: true
    },
    eventType: {
        type: String,
        required: true,
        index: true
    },
    webhookId: {
        type: String,
        index: true
    },
    
    // Request details
    method: {
        type: String,
        default: 'POST'
    },
    url: {
        type: String,
        required: true
    },
    headers: {
        type: Map,
        of: String
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    rawPayload: String,
    
    // Processing details
    status: {
        type: String,
        enum: ['received', 'processing', 'success', 'failed', 'duplicate', 'ignored'],
        default: 'received',
        index: true
    },
    processingTime: {
        type: Number, // milliseconds
        index: true
    },
    retryCount: {
        type: Number,
        default: 0
    },
    
    // Response details
    responseStatus: Number,
    responseBody: mongoose.Schema.Types.Mixed,
    
    // Error handling
    error: {
        message: String,
        code: String,
        stack: String
    },
    
    // Verification
    signatureValid: {
        type: Boolean,
        default: null
    },
    signatureError: String,
    
    // Related records
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        index: true
    },
    communicationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Communication',
        index: true
    },
    
    // Metadata
    userAgent: String,
    clientIp: String,
    processed: {
        type: Boolean,
        default: false,
        index: true
    },
    processingNotes: [String],
    
    // Timestamps
    receivedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    processedAt: Date,
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for performance
webhookLogSchema.index({ provider: 1, eventType: 1, receivedAt: -1 });
webhookLogSchema.index({ status: 1, receivedAt: -1 });
webhookLogSchema.index({ webhookId: 1, provider: 1 });
webhookLogSchema.index({ createdAt: -1 });

// Pre-save middleware
webhookLogSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    
    if (this.isModified('status') && this.status === 'success' && !this.processedAt) {
        this.processedAt = new Date();
        this.processed = true;
    }
    
    next();
});

// Static methods for analytics
webhookLogSchema.statics.getStats = function(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return this.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
            $group: {
                _id: {
                    provider: '$provider',
                    status: '$status'
                },
                count: { $sum: 1 },
                avgProcessingTime: { $avg: '$processingTime' },
                maxProcessingTime: { $max: '$processingTime' }
            }
        }
    ]);
};

webhookLogSchema.statics.getFailureRate = function(provider, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return this.aggregate([
        { 
            $match: { 
                provider: provider,
                createdAt: { $gte: since } 
            } 
        },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                failed: {
                    $sum: {
                        $cond: [{ $eq: ['$status', 'failed'] }, 1, 0]
                    }
                }
            }
        },
        {
            $project: {
                _id: 0,
                total: 1,
                failed: 1,
                failureRate: {
                    $cond: [
                        { $gt: ['$total', 0] },
                        { $multiply: [{ $divide: ['$failed', '$total'] }, 100] },
                        0
                    ]
                }
            }
        }
    ]);
};

// Method to log webhook processing
webhookLogSchema.statics.logWebhook = async function(data) {
    try {
        const log = new this(data);
        await log.save();
        return log;
    } catch (error) {
        console.error('Failed to log webhook:', error);
        return null;
    }
};

module.exports = mongoose.model('WebhookLog', webhookLogSchema);