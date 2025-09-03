const mongoose = require('mongoose');

const smsTemplateSchema = new mongoose.Schema({
    // Template Information
    name: {
        type: String,
        required: true,
        unique: true
    },
    category: {
        type: String,
        enum: [
            'welcome', 'follow-up', 'appointment', 'reminder', 
            'proposal', 'project-update', 'payment', 'thank-you',
            'lead-nurture', 're-engagement', 'emergency', 'custom'
        ],
        default: 'custom'
    },
    description: String,
    
    // SMS Content
    content: {
        type: String,
        required: true,
        maxLength: 1600 // SMS length limit
    },
    
    // Merge Tags/Variables
    availableTags: [{
        tag: String,        // {{customerName}}
        description: String, // Customer's full name
        defaultValue: String
    }],
    
    // Conditional Logic
    conditions: {
        leadStatus: [String], // ['new', 'contacted', 'qualified']
        projectType: [String], // ['business', 'ecommerce', 'webapp']
        budgetRange: {
            min: Number,
            max: Number
        },
        daysSinceLastContact: Number,
        timeOfDay: {
            start: String, // "09:00"
            end: String    // "17:00"
        }
    },
    
    // Settings
    isActive: {
        type: Boolean,
        default: true
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    priority: {
        type: Number,
        default: 1
    },
    
    // Character Limits & Splitting
    maxLength: {
        type: Number,
        default: 160,
        validate: {
            validator: function(v) {
                return v <= 1600; // OpenPhone limit
            },
            message: 'SMS template cannot exceed 1600 characters'
        }
    },
    allowSplitting: {
        type: Boolean,
        default: true
    },
    splitMarker: {
        type: String,
        default: ' (cont.)'
    },
    
    // Usage Stats
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsedDate: Date,
    successRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    
    // A/B Testing
    variants: [{
        name: String,
        content: String,
        usageCount: { type: Number, default: 0 },
        conversionRate: { type: Number, default: 0 }
    }],
    
    // Scheduling
    schedulingRules: {
        allowWeekends: { type: Boolean, default: false },
        businessHoursOnly: { type: Boolean, default: true },
        timezone: { type: String, default: 'America/New_York' },
        optimalSendTimes: [String] // ["09:00", "13:00", "17:00"]
    },
    
    // Metadata
    createdBy: String,
    updatedBy: String,
    tags: [String], // For organization/filtering
    
    // Versioning
    version: {
        type: Number,
        default: 1
    }
}, {
    timestamps: true
});

// Indexes for performance
smsTemplateSchema.index({ category: 1, isActive: 1 });
smsTemplateSchema.index({ priority: -1, isActive: 1 });
smsTemplateSchema.index({ 'conditions.leadStatus': 1 });
smsTemplateSchema.index({ tags: 1 });

// Process merge tags and personalization
smsTemplateSchema.methods.processMergeTags = function(data = {}) {
    let content = this.content;
    
    // Default merge tags
    const mergeTags = {
        '{{customerName}}': data.customerName || data.name || 'there',
        '{{firstName}}': data.firstName || data.name?.split(' ')[0] || 'there',
        '{{lastName}}': data.lastName || data.name?.split(' ').slice(1).join(' ') || '',
        '{{companyName}}': data.companyName || data.company || '',
        '{{phone}}': data.phone || '',
        '{{email}}': data.email || '',
        '{{projectType}}': data.projectType || '',
        '{{budget}}': data.budget ? this.formatBudget(data.budget) : '',
        '{{timeline}}': data.timeline || '',
        '{{status}}': data.status || '',
        '{{source}}': data.source || '',
        '{{currentDate}}': new Date().toLocaleDateString(),
        '{{currentTime}}': new Date().toLocaleTimeString(),
        '{{dayName}}': new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        '{{companyPhone}}': process.env.OPENPHONE_PHONE_NUMBER || '(234) 567-890',
        '{{companyName}}': 'TownRanker',
        '{{website}}': 'townranker.com',
        '{{unsubscribe}}': 'Reply STOP to unsubscribe'
    };
    
    // Add custom tags from data
    Object.keys(data).forEach(key => {
        if (typeof data[key] === 'string' || typeof data[key] === 'number') {
            mergeTags[`{{${key}}}`] = data[key].toString();
        }
    });
    
    // Replace all tags
    Object.keys(mergeTags).forEach(tag => {
        const regex = new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g');
        content = content.replace(regex, mergeTags[tag] || '');
    });
    
    // Clean up any remaining unreplaced tags
    content = content.replace(/\{\{[^}]+\}\}/g, '');
    
    return content;
};

// Format budget as currency
smsTemplateSchema.methods.formatBudget = function(budget) {
    if (!budget || isNaN(budget)) return '';
    
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(budget);
};

// Split long messages if needed
smsTemplateSchema.methods.splitMessage = function(processedContent) {
    if (!this.allowSplitting || processedContent.length <= this.maxLength) {
        return [processedContent];
    }
    
    const maxSegmentLength = this.maxLength - this.splitMarker.length;
    const segments = [];
    let currentSegment = '';
    
    const words = processedContent.split(' ');
    
    for (const word of words) {
        if ((currentSegment + ' ' + word).length > maxSegmentLength) {
            if (currentSegment) {
                segments.push(currentSegment.trim() + this.splitMarker);
                currentSegment = word;
            } else {
                // Word is too long, split it
                segments.push(word.substring(0, maxSegmentLength) + this.splitMarker);
                currentSegment = word.substring(maxSegmentLength);
            }
        } else {
            currentSegment += (currentSegment ? ' ' : '') + word;
        }
    }
    
    if (currentSegment) {
        segments.push(currentSegment.trim());
    }
    
    return segments;
};

// Check if template matches conditions
smsTemplateSchema.methods.matchesConditions = function(leadData = {}) {
    const conditions = this.conditions;
    
    // Check lead status
    if (conditions.leadStatus && conditions.leadStatus.length > 0) {
        if (!conditions.leadStatus.includes(leadData.status)) {
            return false;
        }
    }
    
    // Check project type
    if (conditions.projectType && conditions.projectType.length > 0) {
        if (!conditions.projectType.includes(leadData.projectType)) {
            return false;
        }
    }
    
    // Check budget range
    if (conditions.budgetRange) {
        const budget = parseFloat(leadData.budget) || 0;
        if (conditions.budgetRange.min && budget < conditions.budgetRange.min) {
            return false;
        }
        if (conditions.budgetRange.max && budget > conditions.budgetRange.max) {
            return false;
        }
    }
    
    // Check days since last contact
    if (conditions.daysSinceLastContact && leadData.lastContactDate) {
        const daysSince = Math.floor((Date.now() - new Date(leadData.lastContactDate)) / (1000 * 60 * 60 * 24));
        if (daysSince < conditions.daysSinceLastContact) {
            return false;
        }
    }
    
    // Check time of day
    if (conditions.timeOfDay && conditions.timeOfDay.start && conditions.timeOfDay.end) {
        const now = new Date();
        const currentTime = now.toTimeString().substring(0, 5); // HH:MM format
        if (currentTime < conditions.timeOfDay.start || currentTime > conditions.timeOfDay.end) {
            return false;
        }
    }
    
    return true;
};

// Increment usage stats
smsTemplateSchema.methods.incrementUsage = function(wasSuccessful = true) {
    this.usageCount += 1;
    this.lastUsedDate = new Date();
    
    if (wasSuccessful) {
        // Update success rate (weighted average)
        this.successRate = ((this.successRate * (this.usageCount - 1)) + 100) / this.usageCount;
    } else {
        this.successRate = ((this.successRate * (this.usageCount - 1)) + 0) / this.usageCount;
    }
    
    return this.save();
};

// Static method to find best template for lead
smsTemplateSchema.statics.findBestTemplate = async function(category, leadData = {}) {
    try {
        // Find all active templates in category
        const templates = await this.find({
            category: category,
            isActive: true
        }).sort({ priority: -1, successRate: -1 });
        
        // Filter by conditions
        const matchingTemplates = templates.filter(template => 
            template.matchesConditions(leadData)
        );
        
        if (matchingTemplates.length === 0) {
            // Fallback to default template in category
            const defaultTemplate = await this.findOne({
                category: category,
                isDefault: true,
                isActive: true
            });
            
            if (defaultTemplate) {
                return defaultTemplate;
            }
            
            // Final fallback to any template in category
            return templates[0] || null;
        }
        
        // Return highest priority matching template
        return matchingTemplates[0];
        
    } catch (error) {
        console.error('Error finding best SMS template:', error);
        return null;
    }
};

// Generate processed SMS content
smsTemplateSchema.methods.generateSMS = function(leadData = {}) {
    try {
        // Process merge tags
        const processedContent = this.processMergeTags(leadData);
        
        // Split if necessary
        const segments = this.splitMessage(processedContent);
        
        return {
            success: true,
            template: {
                id: this._id,
                name: this.name,
                category: this.category
            },
            content: processedContent,
            segments: segments,
            segmentCount: segments.length,
            totalLength: processedContent.length,
            withinLimit: processedContent.length <= this.maxLength
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

module.exports = mongoose.model('SMSTemplate', smsTemplateSchema);