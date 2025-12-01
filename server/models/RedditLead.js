const mongoose = require('mongoose');

const redditLeadSchema = new mongoose.Schema({
    // Reddit identifiers
    redditPostId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    redditUrl: {
        type: String,
        required: true
    },
    subreddit: {
        type: String,
        required: true,
        index: true
    },
    author: {
        type: String
    },

    // Content
    title: {
        type: String,
        required: true
    },
    selftext: {
        type: String
    },

    // Scoring
    score: {
        type: Number,
        default: 0
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium',
        index: true
    },
    serviceMatches: [String],
    intentMatches: [String],
    locationMatches: [String],

    // Monitor tracking
    monitorId: {
        type: String,
        required: true,
        index: true
    },
    monitorName: {
        type: String
    },

    // Status workflow
    status: {
        type: String,
        enum: ['new', 'reviewed', 'contacted', 'converted', 'ignored'],
        default: 'new',
        index: true
    },
    convertedToLeadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead'
    },

    // Response tracking
    responded: {
        type: Boolean,
        default: false
    },
    responseDate: Date,
    responseNotes: String,

    // Reddit metadata
    redditScore: {
        type: Number
    },
    numComments: {
        type: Number
    },
    postCreatedAt: {
        type: Date
    },

    // Notifications
    slackSent: {
        type: Boolean,
        default: false
    },
    slackSentAt: Date,

    // Discovery timestamp
    discoveredAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Compound indexes for common queries
redditLeadSchema.index({ status: 1, discoveredAt: -1 });
redditLeadSchema.index({ monitorId: 1, status: 1 });
redditLeadSchema.index({ subreddit: 1, discoveredAt: -1 });

// Virtual for age in days
redditLeadSchema.virtual('ageInDays').get(function() {
    return Math.floor((Date.now() - this.discoveredAt) / (1000 * 60 * 60 * 24));
});

// Method to convert to full Lead
redditLeadSchema.methods.convertToLead = async function() {
    const Lead = mongoose.model('Lead');

    const lead = new Lead({
        name: `Reddit Lead - r/${this.subreddit}`,
        email: `reddit-${this.redditPostId}@leads.townranker.local`,
        phone: '0000000000',
        company: `r/${this.subreddit}`,
        message: [
            `**Reddit Lead Opportunity**`,
            ``,
            `**Title:** ${this.title}`,
            `**Content:** ${this.selftext || 'No content'}`,
            `**URL:** ${this.redditUrl}`,
            ``,
            `**Intent Score:** ${this.score} (${this.priority})`,
            `**Service Matches:** ${this.serviceMatches?.join(', ') || 'None'}`,
            `**Intent Matches:** ${this.intentMatches?.join(', ') || 'None'}`,
            `**Location Matches:** ${this.locationMatches?.join(', ') || 'None'}`
        ].join('\n'),
        status: 'new',
        source: 'social-media',
        priority: this.priority,
        tags: ['reddit-opportunity', this.monitorId, `r/${this.subreddit}`],
        leadScore: Math.min(this.score, 100)
    });

    await lead.save();

    this.status = 'converted';
    this.convertedToLeadId = lead._id;
    await this.save();

    return lead;
};

module.exports = mongoose.model('RedditLead', redditLeadSchema);
