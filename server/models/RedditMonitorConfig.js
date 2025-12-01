const mongoose = require('mongoose');

const redditMonitorConfigSchema = new mongoose.Schema({
    // Monitor identification
    monitorId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    businessName: {
        type: String
    },
    description: {
        type: String
    },

    // Target subreddits (34 Arizona subs)
    targetSubreddits: [{
        type: String,
        lowercase: true
    }],

    // Search terms for Reddit API queries
    searchTerms: [{
        type: String
    }],

    // Keyword configuration (preserved from current system)
    highIntentPhrases: [String],     // 97 phrases, 30 pts each
    serviceKeywords: [String],        // 59 keywords, 15 pts each
    locationKeywords: [String],       // 9 keywords, 10 pts each
    exclusionKeywords: [String],      // 42 exclusions

    // Scoring configuration
    scoring: {
        highIntentWeight: {
            type: Number,
            default: 30
        },
        serviceWeight: {
            type: Number,
            default: 15
        },
        locationWeight: {
            type: Number,
            default: 10
        },
        minScore: {
            type: Number,
            default: 30
        },
        thresholds: {
            high: {
                type: Number,
                default: 60
            },
            medium: {
                type: Number,
                default: 40
            }
        }
    },

    // Slack notification settings
    slackWebhookUrl: {
        type: String
    },
    slackEnabled: {
        type: Boolean,
        default: true
    },

    // Socket.io real-time updates
    socketEnabled: {
        type: Boolean,
        default: true
    },

    // Schedule configuration
    intervalMinutes: {
        type: Number,
        default: 30
    },
    isActive: {
        type: Boolean,
        default: true
    },

    // Location context
    location: {
        type: String,
        default: 'Phoenix, Arizona'
    },
    timezone: {
        type: String,
        default: 'America/Phoenix'
    },

    // Run statistics
    lastRunAt: {
        type: Date
    },
    lastRunStats: {
        postsChecked: Number,
        leadsFound: Number,
        subredditsSearched: Number,
        errors: Number
    },

    // Lifetime statistics
    totalLeadsFound: {
        type: Number,
        default: 0
    },
    totalPostsChecked: {
        type: Number,
        default: 0
    }

}, {
    timestamps: true
});

// Method to update run stats
redditMonitorConfigSchema.methods.updateRunStats = async function(stats) {
    this.lastRunAt = new Date();
    this.lastRunStats = stats;
    this.totalLeadsFound += stats.leadsFound || 0;
    this.totalPostsChecked += stats.postsChecked || 0;
    return this.save();
};

// Static method to get active monitors
redditMonitorConfigSchema.statics.getActive = function() {
    return this.find({ isActive: true });
};

module.exports = mongoose.model('RedditMonitorConfig', redditMonitorConfigSchema);
