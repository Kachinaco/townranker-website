const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    // Basic Information
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    company: {
        type: String,
        trim: true
    },
    
    // Customer Status
    status: {
        type: String,
        enum: ['lead', 'prospect', 'client', 'inactive', 'completed'],
        default: 'lead'
    },
    leadScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    
    // Project Requirements (from initial form)
    projectType: {
        type: String,
        enum: ['business', 'ecommerce', 'webapp', 'landing', 'custom']
    },
    budget: {
        type: Number
    },
    timeline: {
        type: String
    },
    features: [{
        type: String
    }],
    initialMessage: {
        type: String
    },
    
    // Business Information
    industry: String,
    website: String,
    address: {
        street: String,
        city: String,
        state: String,
        zip: String,
        country: String
    },
    
    // Source & Attribution
    source: {
        type: String,
        default: 'website'
    },
    referral: String,
    campaign: String,
    
    // Financial Summary
    totalRevenue: {
        type: Number,
        default: 0
    },
    totalPaid: {
        type: Number,
        default: 0
    },
    outstandingBalance: {
        type: Number,
        default: 0
    },
    
    // Relationship Management
    assignedTo: String,
    tags: [{
        type: String
    }],
    notes: [{
        content: String,
        createdBy: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Important Dates
    firstContactDate: {
        type: Date,
        default: Date.now
    },
    lastContactDate: Date,
    nextFollowUp: Date,
    convertedDate: Date,
    
    // Linked Records
    projects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
    }],
    proposals: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Proposal'
    }],
    payments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment'
    }],
    communications: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Communication'
    }],
    
    // Custom Fields
    customFields: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    },
    
    // Metadata
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

// Calculate lead score based on various factors
customerSchema.methods.calculateLeadScore = function() {
    let score = 0;
    
    // Budget score (0-40 points)
    if (this.budget >= 25000) score += 40;
    else if (this.budget >= 10000) score += 30;
    else if (this.budget >= 5000) score += 20;
    else if (this.budget >= 1000) score += 10;
    
    // Timeline score (0-20 points)
    if (this.timeline === 'asap') score += 20;
    else if (this.timeline === '1-2months') score += 15;
    else if (this.timeline === '3-4months') score += 10;
    
    // Engagement score (0-20 points)
    if (this.communications && this.communications.length > 5) score += 20;
    else if (this.communications && this.communications.length > 2) score += 10;
    
    // Company info score (0-10 points)
    if (this.company) score += 5;
    if (this.website) score += 5;
    
    // Responsiveness score (0-10 points)
    if (this.lastContactDate) {
        const daysSinceContact = (Date.now() - this.lastContactDate) / (1000 * 60 * 60 * 24);
        if (daysSinceContact < 1) score += 10;
        else if (daysSinceContact < 3) score += 5;
    }
    
    this.leadScore = Math.min(score, 100);
    return this.leadScore;
};

// Auto-update priority based on lead score
customerSchema.pre('save', function(next) {
    this.calculateLeadScore();
    
    if (this.leadScore >= 80) this.priority = 'urgent';
    else if (this.leadScore >= 60) this.priority = 'high';
    else if (this.leadScore >= 40) this.priority = 'medium';
    else this.priority = 'low';
    
    next();
});

// Virtual for full address
customerSchema.virtual('fullAddress').get(function() {
    if (!this.address || !this.address.street) return '';
    return `${this.address.street}, ${this.address.city}, ${this.address.state} ${this.address.zip}`;
});

// Index for search
customerSchema.index({ name: 'text', email: 'text', company: 'text' });
customerSchema.index({ status: 1, priority: -1, leadScore: -1 });
customerSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('Customer', customerSchema);