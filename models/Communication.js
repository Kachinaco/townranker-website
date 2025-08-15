const mongoose = require('mongoose');

const communicationSchema = new mongoose.Schema({
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
    
    // Email Details
    type: {
        type: String,
        enum: ['email', 'call', 'meeting', 'note', 'sms'],
        default: 'email'
    },
    direction: {
        type: String,
        enum: ['inbound', 'outbound'],
        default: 'outbound'
    },
    
    // Email Specific Fields
    emailId: {
        type: String,
        unique: true,
        sparse: true
    },
    subject: {
        type: String,
        required: function() { return this.type === 'email'; }
    },
    body: {
        type: String,
        required: true
    },
    bodyHtml: String,
    from: {
        name: String,
        email: String
    },
    to: [{
        name: String,
        email: String
    }],
    cc: [{
        name: String,
        email: String
    }],
    bcc: [{
        name: String,
        email: String
    }],
    replyTo: String,
    
    // Template Information
    template: {
        id: String,
        name: String,
        version: Number
    },
    mergeData: mongoose.Schema.Types.Mixed,
    
    // Attachments
    attachments: [{
        filename: String,
        url: String,
        size: Number,
        type: String
    }],
    
    // Status and Tracking
    status: {
        type: String,
        enum: ['draft', 'queued', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed'],
        default: 'draft'
    },
    
    // Timestamps
    scheduledDate: Date,
    sentDate: Date,
    deliveredDate: Date,
    firstOpenedDate: Date,
    lastOpenedDate: Date,
    repliedDate: Date,
    bouncedDate: Date,
    
    // Tracking Metrics
    openCount: {
        type: Number,
        default: 0
    },
    clickCount: {
        type: Number,
        default: 0
    },
    clickedLinks: [{
        url: String,
        clickCount: Number,
        firstClick: Date,
        lastClick: Date
    }],
    
    // Tracking Details
    trackingId: String,
    trackingPixel: String,
    opens: [{
        date: Date,
        ip: String,
        userAgent: String,
        location: String
    }],
    clicks: [{
        date: Date,
        url: String,
        ip: String,
        userAgent: String
    }],
    
    // Campaign Information
    campaign: {
        id: String,
        name: String,
        type: String
    },
    
    // Call/Meeting Specific Fields
    duration: Number, // in minutes
    callRecording: String,
    meetingNotes: String,
    attendees: [String],
    outcome: String,
    
    // Follow-up
    followUpRequired: {
        type: Boolean,
        default: false
    },
    followUpDate: Date,
    followUpNote: String,
    
    // Threading
    threadId: String,
    inReplyTo: String,
    references: [String],
    
    // Error Handling
    error: {
        message: String,
        code: String,
        date: Date
    },
    
    // Metadata
    tags: [String],
    importance: {
        type: String,
        enum: ['low', 'normal', 'high'],
        default: 'normal'
    },
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

// Generate unique email ID
communicationSchema.methods.generateEmailId = function() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    this.emailId = `${timestamp}-${random}@townranker.com`;
    return this.emailId;
};

// Generate tracking pixel
communicationSchema.methods.generateTrackingPixel = function() {
    const crypto = require('crypto');
    this.trackingId = crypto.randomBytes(16).toString('hex');
    this.trackingPixel = `/api/crm/emails/track/${this.trackingId}/pixel.gif`;
    return this.trackingPixel;
};

// Add tracking to HTML body
communicationSchema.methods.addTrackingToHtml = function(html) {
    if (!this.trackingId) {
        this.generateTrackingPixel();
    }
    
    // Add tracking pixel
    const pixel = `<img src="${process.env.BASE_URL || 'https://townranker.com'}${this.trackingPixel}" width="1" height="1" style="display:none;" />`;
    
    // Add click tracking to links
    const trackedHtml = html.replace(
        /<a([^>]+)href="([^"]+)"([^>]*)>/gi,
        (match, before, url, after) => {
            const trackUrl = `/api/crm/emails/track/${this.trackingId}/click?url=${encodeURIComponent(url)}`;
            return `<a${before}href="${process.env.BASE_URL || 'https://townranker.com'}${trackUrl}"${after}>`;
        }
    );
    
    // Add pixel before closing body tag or at the end
    if (trackedHtml.includes('</body>')) {
        return trackedHtml.replace('</body>', `${pixel}</body>`);
    } else {
        return trackedHtml + pixel;
    }
};

// Track email open
communicationSchema.methods.trackOpen = function(ip, userAgent) {
    this.openCount += 1;
    
    if (!this.firstOpenedDate) {
        this.firstOpenedDate = new Date();
        this.status = 'opened';
    }
    
    this.lastOpenedDate = new Date();
    
    this.opens.push({
        date: new Date(),
        ip: ip,
        userAgent: userAgent
    });
    
    return this.save();
};

// Track link click
communicationSchema.methods.trackClick = function(url, ip, userAgent) {
    this.clickCount += 1;
    
    if (this.status === 'opened') {
        this.status = 'clicked';
    }
    
    // Update clicked links
    const linkIndex = this.clickedLinks.findIndex(link => link.url === url);
    if (linkIndex >= 0) {
        this.clickedLinks[linkIndex].clickCount += 1;
        this.clickedLinks[linkIndex].lastClick = new Date();
    } else {
        this.clickedLinks.push({
            url: url,
            clickCount: 1,
            firstClick: new Date(),
            lastClick: new Date()
        });
    }
    
    // Add to clicks array
    this.clicks.push({
        date: new Date(),
        url: url,
        ip: ip,
        userAgent: userAgent
    });
    
    return this.save();
};

// Calculate engagement score
communicationSchema.virtual('engagementScore').get(function() {
    let score = 0;
    
    // Email sent: 10 points
    if (this.status !== 'draft' && this.status !== 'failed') score += 10;
    
    // Email opened: 20 points
    if (this.openCount > 0) score += 20;
    
    // Multiple opens: +5 per additional open (max 25)
    if (this.openCount > 1) score += Math.min((this.openCount - 1) * 5, 25);
    
    // Links clicked: 30 points
    if (this.clickCount > 0) score += 30;
    
    // Multiple clicks: +10 per additional click (max 30)
    if (this.clickCount > 1) score += Math.min((this.clickCount - 1) * 10, 30);
    
    // Replied: 15 points
    if (this.status === 'replied') score += 15;
    
    return Math.min(score, 100);
});

// Pre-save middleware
communicationSchema.pre('save', function(next) {
    // Generate email ID if not exists
    if (this.type === 'email' && !this.emailId) {
        this.generateEmailId();
    }
    
    // Update customer's last contact date
    if (this.isNew && this.customer) {
        const Customer = mongoose.model('Customer');
        Customer.findByIdAndUpdate(
            this.customer,
            { 
                lastContactDate: this.createdAt,
                $push: { communications: this._id }
            }
        ).exec();
    }
    
    next();
});

// Indexes
communicationSchema.index({ customer: 1, type: 1, createdAt: -1 });
communicationSchema.index({ emailId: 1 }, { unique: true, sparse: true });
communicationSchema.index({ trackingId: 1 });
communicationSchema.index({ 'campaign.id': 1 });
communicationSchema.index({ threadId: 1 });

module.exports = mongoose.model('Communication', communicationSchema);