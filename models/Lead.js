const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        trim: true,
        maxlength: 100
    },
    email: { 
        type: String, 
        required: true, 
        lowercase: true, 
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },
    phone: { 
        type: String, 
        required: true, 
        trim: true,
        match: [/^[\+]?[1-9][\d]{9,14}$/, 'Please enter a valid phone number']
    },
    projectType: { 
        type: String,
        enum: ['website-design', 'seo', 'digital-marketing', 'e-commerce', 'mobile-app', 'other'],
        default: 'other'
    },
    budget: { 
        type: Number, 
        default: 0,
        min: 0
    },
    timeline: { 
        type: String,
        enum: ['asap', '1-month', '2-3months', '3-6months', '6months+', 'flexible'],
        default: 'flexible'
    },
    features: [{ 
        type: String,
        trim: true
    }],
    company: { 
        type: String,
        trim: true,
        maxlength: 100
    },
    message: { 
        type: String,
        trim: true,
        maxlength: 1000
    },
    priority: { 
        type: String, 
        enum: ['low', 'medium', 'high', 'urgent'], 
        default: 'medium' 
    },
    status: { 
        type: String, 
        enum: ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed', 'lost'], 
        default: 'new' 
    },
    source: { 
        type: String, 
        enum: ['website', 'referral', 'social-media', 'advertising', 'sms', 'direct', 'other'],
        default: 'website' 
    },
    tags: [{
        type: String,
        trim: true
    }],
    
    // CRM Fields
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastContactDate: Date,
    nextFollowUpDate: Date,
    
    // Workflow & Interactions
    workflowItems: [{
        id: String,
        title: String,
        description: String,
        status: {
            type: String,
            enum: ['pending', 'in-progress', 'completed', 'cancelled'],
            default: 'pending'
        },
        column: String,
        order: Number,
        dueDate: Date,
        assignedTo: String,
        completedAt: Date,
        createdAt: { type: Date, default: Date.now }
    }],
    workflowColumns: [{
        id: String,
        title: String,
        order: Number
    }],
    
    interactions: [{
        type: {
            type: String,
            enum: ['call', 'email', 'meeting', 'note', 'sms', 'task'],
            required: true
        },
        title: { type: String, required: true },
        description: String,
        outcome: String,
        nextAction: String,
        metadata: {
            duration: Number, // for calls/meetings (minutes)
            emailId: String,
            phoneNumber: String,
            platform: String
        },
        createdBy: String,
        createdAt: { type: Date, default: Date.now }
    }],
    
    // Notes
    notes: [{ 
        content: { type: String, required: true },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'low'
        },
        createdBy: String,
        createdAt: { type: Date, default: Date.now }
    }],
    
    // Tracking
    leadScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    engagementLevel: {
        type: String,
        enum: ['cold', 'warm', 'hot'],
        default: 'cold'
    },
    
    // Communications (emails, SMS, calls)
    communications: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Communication'
    }],
    
    // Email History
    emailHistory: [{
        subject: String,
        body: String,
        template: String,
        sentAt: { type: Date, default: Date.now },
        messageId: String,
        status: {
            type: String,
            enum: ['sent', 'delivered', 'opened', 'bounced', 'failed'],
            default: 'sent'
        },
        openCount: { type: Number, default: 0 },
        lastOpened: Date,
        metadata: {
            campaign: String,
            tags: [String]
        }
    }],
    
    // SMS History
    smsHistory: [{
        body: String,
        to: String,
        from: String,
        direction: {
            type: String,
            enum: ['inbound', 'outbound'],
            default: 'outbound'
        },
        sentAt: { type: Date, default: Date.now },
        messageId: String,
        status: {
            type: String,
            enum: ['sent', 'delivered', 'read', 'failed'],
            default: 'sent'
        },
        metadata: {
            conversationId: String,
            mediaUrls: [String]
        }
    }],
    
    // Timestamps
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
leadSchema.index({ email: 1 }, { unique: true });
leadSchema.index({ phone: 1 });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ priority: 1, status: 1 });
leadSchema.index({ source: 1, createdAt: -1 });
leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ lastContactDate: -1 });
leadSchema.index({ nextFollowUpDate: 1 });

// Virtual for days since created
leadSchema.virtual('daysSinceCreated').get(function() {
    return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual for days since last contact
leadSchema.virtual('daysSinceLastContact').get(function() {
    if (!this.lastContactDate) return null;
    return Math.floor((Date.now() - this.lastContactDate) / (1000 * 60 * 60 * 24));
});

// Pre-save middleware
leadSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    
    // Auto-calculate lead score based on interactions, budget, etc.
    this.calculateLeadScore();
    
    next();
});

// Methods
leadSchema.methods.calculateLeadScore = function() {
    let score = 0;
    
    // Base score based on budget
    if (this.budget >= 50000) score += 40;
    else if (this.budget >= 25000) score += 30;
    else if (this.budget >= 10000) score += 20;
    else if (this.budget >= 5000) score += 10;
    
    // Score based on interactions
    score += Math.min(this.interactions.length * 5, 25);
    
    // Score based on status
    const statusScores = {
        'new': 5,
        'contacted': 15,
        'qualified': 30,
        'proposal': 50,
        'negotiation': 70,
        'closed': 100,
        'lost': 0
    };
    score += statusScores[this.status] || 0;
    
    // Timeline urgency
    const timelineScores = {
        'asap': 20,
        '1-month': 15,
        '2-3months': 10,
        '3-6months': 5,
        '6months+': 2,
        'flexible': 0
    };
    score += timelineScores[this.timeline] || 0;
    
    this.leadScore = Math.min(score, 100);
    
    // Set engagement level
    if (this.leadScore >= 70) this.engagementLevel = 'hot';
    else if (this.leadScore >= 40) this.engagementLevel = 'warm';
    else this.engagementLevel = 'cold';
};

leadSchema.methods.addInteraction = function(interactionData) {
    this.interactions.push({
        ...interactionData,
        createdAt: new Date()
    });
    this.lastContactDate = new Date();
    return this.save();
};

leadSchema.methods.addNote = function(content, priority = 'low', createdBy = 'system') {
    this.notes.push({
        content,
        priority,
        createdBy,
        createdAt: new Date()
    });
    return this.save();
};

module.exports = mongoose.model('Lead', leadSchema);