const mongoose = require('mongoose');

const proposalSchema = new mongoose.Schema({
    // Relations
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
    },
    
    // Proposal Details
    proposalNumber: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        required: true
    },
    version: {
        type: Number,
        default: 1
    },
    status: {
        type: String,
        enum: ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'revised'],
        default: 'draft'
    },
    
    // Content Sections
    executiveSummary: String,
    projectOverview: String,
    scope: {
        included: [String],
        excluded: [String]
    },
    
    // Deliverables and Timeline
    deliverables: [{
        phase: String,
        title: String,
        description: String,
        duration: String,
        startDate: Date,
        endDate: Date
    }],
    timeline: {
        startDate: Date,
        endDate: Date,
        totalDuration: String,
        milestones: [{
            name: String,
            date: Date,
            description: String
        }]
    },
    
    // Pricing
    pricingModel: {
        type: String,
        enum: ['fixed', 'hourly', 'retainer', 'milestone'],
        default: 'fixed'
    },
    pricing: [{
        item: String,
        description: String,
        quantity: Number,
        rate: Number,
        amount: Number
    }],
    subtotal: {
        type: Number,
        required: true
    },
    discount: {
        amount: Number,
        type: {
            type: String,
            enum: ['percentage', 'fixed'],
            default: 'fixed'
        }
    },
    tax: {
        rate: Number,
        amount: Number
    },
    total: {
        type: Number,
        required: true
    },
    
    // Payment Terms
    paymentTerms: {
        schedule: [{
            milestone: String,
            percentage: Number,
            amount: Number,
            dueDate: Date
        }],
        lateFee: Number,
        acceptedMethods: [String]
    },
    
    // Terms and Conditions
    termsAndConditions: String,
    customTerms: [String],
    
    // Validity
    validUntil: {
        type: Date,
        required: true
    },
    
    // Client Acceptance
    acceptanceRequired: {
        type: Boolean,
        default: true
    },
    acceptedBy: {
        name: String,
        email: String,
        title: String,
        date: Date,
        ip: String,
        signature: String // Base64 or URL to signature image
    },
    rejectionReason: String,
    
    // Templates
    template: {
        type: String,
        enum: ['standard', 'detailed', 'simple', 'custom'],
        default: 'standard'
    },
    customStyling: {
        primaryColor: String,
        logo: String,
        font: String
    },
    
    // Attachments
    attachments: [{
        name: String,
        url: String,
        type: String,
        size: Number
    }],
    
    // Tracking
    sentDate: Date,
    viewedDate: Date,
    viewCount: {
        type: Number,
        default: 0
    },
    lastViewedDate: Date,
    viewerInfo: [{
        date: Date,
        ip: String,
        userAgent: String
    }],
    
    // Communication
    messages: [{
        from: String,
        to: String,
        subject: String,
        body: String,
        date: Date,
        type: {
            type: String,
            enum: ['sent', 'received']
        }
    }],
    
    // Links
    publicLink: String,
    privateToken: String,
    
    // Revision History
    revisions: [{
        version: Number,
        date: Date,
        changes: String,
        changedBy: String,
        content: mongoose.Schema.Types.Mixed // Store previous version
    }],
    
    // Metadata
    createdBy: String,
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

// Generate proposal number
proposalSchema.statics.generateProposalNumber = async function() {
    const lastProposal = await this.findOne({}, {}, { sort: { 'createdAt': -1 } });
    let nextNumber = 1001;
    
    if (lastProposal && lastProposal.proposalNumber) {
        const lastNumber = parseInt(lastProposal.proposalNumber.replace(/\D/g, ''));
        nextNumber = lastNumber + 1;
    }
    
    const year = new Date().getFullYear();
    return `PROP-${year}-${nextNumber.toString().padStart(4, '0')}`;
};

// Generate unique public link
proposalSchema.methods.generatePublicLink = function() {
    const crypto = require('crypto');
    this.privateToken = crypto.randomBytes(32).toString('hex');
    this.publicLink = `/proposal/view/${this._id}/${this.privateToken}`;
    return this.publicLink;
};

// Calculate pricing totals
proposalSchema.methods.calculateTotals = function() {
    // Calculate subtotal
    if (this.pricing && this.pricing.length > 0) {
        this.subtotal = this.pricing.reduce((acc, item) => acc + (item.amount || 0), 0);
    }
    
    // Calculate discount
    let discountAmount = 0;
    if (this.discount && this.discount.amount) {
        if (this.discount.type === 'percentage') {
            discountAmount = (this.subtotal * this.discount.amount) / 100;
        } else {
            discountAmount = this.discount.amount;
        }
    }
    
    // Calculate tax
    const taxableAmount = this.subtotal - discountAmount;
    if (this.tax && this.tax.rate) {
        this.tax.amount = (taxableAmount * this.tax.rate) / 100;
    }
    
    // Calculate total
    this.total = taxableAmount + (this.tax?.amount || 0);
    
    return {
        subtotal: this.subtotal,
        discount: discountAmount,
        tax: this.tax?.amount || 0,
        total: this.total
    };
};

// Check if proposal is expired
proposalSchema.virtual('isExpired').get(function() {
    return this.status !== 'accepted' && 
           this.status !== 'rejected' && 
           this.validUntil < new Date();
});

// Days until expiry
proposalSchema.virtual('daysUntilExpiry').get(function() {
    if (this.status === 'accepted' || this.status === 'rejected') return 0;
    const days = Math.ceil((this.validUntil - new Date()) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
});

// Create revision
proposalSchema.methods.createRevision = function(changes, changedBy) {
    const revision = {
        version: this.version,
        date: new Date(),
        changes: changes,
        changedBy: changedBy,
        content: this.toObject()
    };
    
    this.revisions.push(revision);
    this.version += 1;
    this.status = 'revised';
    
    return this.version;
};

// Track view
proposalSchema.methods.trackView = function(ip, userAgent) {
    this.viewCount += 1;
    this.lastViewedDate = new Date();
    
    if (!this.viewedDate) {
        this.viewedDate = new Date();
        this.status = 'viewed';
    }
    
    this.viewerInfo.push({
        date: new Date(),
        ip: ip,
        userAgent: userAgent
    });
    
    return this.viewCount;
};

// Pre-save middleware
proposalSchema.pre('save', async function(next) {
    // Generate proposal number if not exists
    if (!this.proposalNumber) {
        this.proposalNumber = await this.constructor.generateProposalNumber();
    }
    
    // Generate public link if not exists
    if (!this.publicLink) {
        this.generatePublicLink();
    }
    
    // Calculate totals
    this.calculateTotals();
    
    // Check if expired
    if (this.isExpired && this.status !== 'expired') {
        this.status = 'expired';
    }
    
    // Set default valid until (30 days)
    if (!this.validUntil) {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        this.validUntil = date;
    }
    
    next();
});

// Indexes
proposalSchema.index({ customer: 1, status: 1 });
proposalSchema.index({ proposalNumber: 1 }, { unique: true });
proposalSchema.index({ privateToken: 1 });

module.exports = mongoose.model('Proposal', proposalSchema);