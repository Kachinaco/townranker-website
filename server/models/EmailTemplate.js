const mongoose = require('mongoose');

const emailTemplateSchema = new mongoose.Schema({
    // Template Information
    name: {
        type: String,
        required: true,
        unique: true
    },
    category: {
        type: String,
        enum: ['welcome', 'follow-up', 'proposal', 'invoice', 'project', 'marketing', 'custom'],
        default: 'custom'
    },
    description: String,
    
    // Email Content
    subject: {
        type: String,
        required: true
    },
    bodyHtml: {
        type: String,
        required: true
    },
    bodyText: String,
    
    // Merge Tags
    availableTags: [{
        tag: String,        // {{customerName}}
        description: String, // Customer's full name
        defaultValue: String
    }],
    
    // Attachments
    defaultAttachments: [{
        filename: String,
        url: String,
        type: String
    }],
    
    // Settings
    isActive: {
        type: Boolean,
        default: true
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    
    // Usage Stats
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsedDate: Date,
    
    // Versioning
    version: {
        type: Number,
        default: 1
    },
    
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

// Process merge tags
emailTemplateSchema.methods.processMergeTags = function(data) {
    let subject = this.subject;
    let body = this.bodyHtml;
    
    // Default merge tags
    const mergeTags = {
        '{{customerName}}': data.customerName || 'Valued Customer',
        '{{firstName}}': data.firstName || data.customerName?.split(' ')[0] || 'there',
        '{{companyName}}': data.companyName || '',
        '{{projectType}}': data.projectType || '',
        '{{budget}}': data.budget || '',
        '{{timeline}}': data.timeline || '',
        '{{currentDate}}': new Date().toLocaleDateString(),
        '{{currentYear}}': new Date().getFullYear()
    };
    
    // Add custom tags from data
    Object.keys(data).forEach(key => {
        mergeTags[`{{${key}}}`] = data[key];
    });
    
    // Replace tags in subject and body
    Object.keys(mergeTags).forEach(tag => {
        const regex = new RegExp(tag, 'g');
        subject = subject.replace(regex, mergeTags[tag]);
        body = body.replace(regex, mergeTags[tag]);
    });
    
    return { subject, body };
};

// Increment usage
emailTemplateSchema.methods.incrementUsage = function() {
    this.usageCount += 1;
    this.lastUsedDate = new Date();
    return this.save();
};

// Index
emailTemplateSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);