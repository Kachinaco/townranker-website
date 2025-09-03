const SMSTemplate = require('../models/SMSTemplate');
const Lead = require('../models/Lead');

class SMSTemplateService {
    constructor() {
        this.defaultTemplates = {
            'welcome': {
                name: 'Welcome New Lead',
                content: 'Hi {{firstName}}! Thanks for your interest in {{projectType}} development. We\'ll be in touch within 24 hours to discuss your project. - TownRanker Team',
                conditions: { leadStatus: ['new'] }
            },
            'follow-up': {
                name: 'Follow-up Message',
                content: 'Hi {{firstName}}, following up on your {{projectType}} project. Do you have a few minutes to chat about your requirements? Call us at {{companyPhone}} - TownRanker',
                conditions: { leadStatus: ['contacted'], daysSinceLastContact: 3 }
            },
            'appointment': {
                name: 'Appointment Reminder',
                content: 'Hi {{firstName}}, reminder: We have a strategy session scheduled for tomorrow. Looking forward to discussing your {{projectType}} project! - TownRanker',
                conditions: {}
            },
            'proposal': {
                name: 'Proposal Follow-up',
                content: 'Hi {{firstName}}, we\'ve sent your {{projectType}} proposal to {{email}}. The {{budget}} package looks perfect for your needs! Questions? Call {{companyPhone}} - TownRanker',
                conditions: { leadStatus: ['proposal'] }
            },
            'project-update': {
                name: 'Project Update',
                content: 'Hi {{firstName}}, your {{projectType}} project is progressing well! We\'ll send an update by email shortly. Any questions? Reply here or call {{companyPhone}} - TownRanker',
                conditions: { leadStatus: ['negotiation', 'closed'] }
            },
            'payment': {
                name: 'Payment Reminder',
                content: 'Hi {{firstName}}, friendly reminder: Your {{projectType}} project payment is due. Secure link sent to {{email}}. Questions? Call {{companyPhone}} - TownRanker',
                conditions: {}
            },
            'thank-you': {
                name: 'Thank You Message',
                content: 'Hi {{firstName}}, thank you for choosing TownRanker for your {{projectType}} project! We\'re excited to bring your vision to life. - The TownRanker Team',
                conditions: { leadStatus: ['closed'] }
            },
            'lead-nurture': {
                name: 'Lead Nurturing',
                content: 'Hi {{firstName}}, still thinking about your {{projectType}} project? We\'d love to help! Free consultation available at {{companyPhone}} - TownRanker',
                conditions: { leadStatus: ['new', 'contacted'], daysSinceLastContact: 7 }
            },
            're-engagement': {
                name: 'Re-engagement Message',
                content: 'Hi {{firstName}}, we haven\'t heard from you in a while! Still interested in {{projectType}} development? We\'re here when you\'re ready. - TownRanker',
                conditions: { daysSinceLastContact: 14 }
            },
            'emergency': {
                name: 'Urgent Communication',
                content: 'Hi {{firstName}}, we need to discuss your {{projectType}} project urgently. Please call {{companyPhone}} ASAP. - TownRanker Team',
                conditions: {}
            }
        };
    }

    /**
     * Initialize default SMS templates
     */
    async initializeDefaultTemplates() {
        try {
            console.log('🔧 Initializing default SMS templates...');
            
            for (const [category, template] of Object.entries(this.defaultTemplates)) {
                const existingTemplate = await SMSTemplate.findOne({ 
                    name: template.name,
                    category: category 
                });
                
                if (!existingTemplate) {
                    const newTemplate = new SMSTemplate({
                        name: template.name,
                        category: category,
                        description: `Default ${category} SMS template`,
                        content: template.content,
                        conditions: template.conditions,
                        isDefault: true,
                        priority: 5, // High priority for defaults
                        availableTags: this.getStandardMergeTags(),
                        maxLength: 160, // Standard SMS length
                        allowSplitting: true,
                        schedulingRules: {
                            allowWeekends: false,
                            businessHoursOnly: true,
                            timezone: 'America/New_York',
                            optimalSendTimes: ['09:00', '13:00', '17:00']
                        },
                        tags: ['default', 'auto-generated'],
                        createdBy: 'system'
                    });
                    
                    await newTemplate.save();
                    console.log(`✅ Created default template: ${template.name}`);
                } else {
                    console.log(`⏭️  Template already exists: ${template.name}`);
                }
            }
            
            console.log('🎉 Default SMS templates initialized successfully');
            return { success: true, message: 'Default templates initialized' };
            
        } catch (error) {
            console.error('❌ Error initializing default templates:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get standard merge tags for templates
     */
    getStandardMergeTags() {
        return [
            { tag: '{{customerName}}', description: 'Customer full name', defaultValue: 'Valued Customer' },
            { tag: '{{firstName}}', description: 'Customer first name', defaultValue: 'there' },
            { tag: '{{lastName}}', description: 'Customer last name', defaultValue: '' },
            { tag: '{{companyName}}', description: 'Customer company name', defaultValue: '' },
            { tag: '{{phone}}', description: 'Customer phone number', defaultValue: '' },
            { tag: '{{email}}', description: 'Customer email address', defaultValue: '' },
            { tag: '{{projectType}}', description: 'Type of project', defaultValue: 'web development' },
            { tag: '{{budget}}', description: 'Project budget', defaultValue: '' },
            { tag: '{{timeline}}', description: 'Project timeline', defaultValue: '' },
            { tag: '{{status}}', description: 'Lead status', defaultValue: '' },
            { tag: '{{source}}', description: 'Lead source', defaultValue: '' },
            { tag: '{{currentDate}}', description: 'Current date', defaultValue: new Date().toLocaleDateString() },
            { tag: '{{currentTime}}', description: 'Current time', defaultValue: new Date().toLocaleTimeString() },
            { tag: '{{dayName}}', description: 'Current day name', defaultValue: new Date().toLocaleDateString('en-US', { weekday: 'long' }) },
            { tag: '{{companyPhone}}', description: 'Company phone number', defaultValue: '(234) 567-890' },
            { tag: '{{companyName}}', description: 'Company name', defaultValue: 'TownRanker' },
            { tag: '{{website}}', description: 'Company website', defaultValue: 'townranker.com' },
            { tag: '{{unsubscribe}}', description: 'Unsubscribe instructions', defaultValue: 'Reply STOP to unsubscribe' }
        ];
    }

    /**
     * Find the best SMS template for a specific scenario
     */
    async findBestTemplate(category, leadData = {}) {
        try {
            // Use static method from model
            const template = await SMSTemplate.findBestTemplate(category, leadData);
            
            if (!template) {
                console.warn(`⚠️  No template found for category: ${category}`);
                return null;
            }
            
            console.log(`📋 Selected template: ${template.name} for category: ${category}`);
            return template;
            
        } catch (error) {
            console.error('❌ Error finding best template:', error);
            return null;
        }
    }

    /**
     * Generate SMS content from template
     */
    async generateSMSFromTemplate(templateId, leadData = {}) {
        try {
            const template = await SMSTemplate.findById(templateId);
            
            if (!template || !template.isActive) {
                throw new Error('Template not found or inactive');
            }
            
            // Generate SMS content
            const result = template.generateSMS(leadData);
            
            if (result.success) {
                // Increment usage
                await template.incrementUsage(true);
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ Error generating SMS from template:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate SMS by category and lead data
     */
    async generateSMSByCategory(category, leadData = {}) {
        try {
            // Find best template
            const template = await this.findBestTemplate(category, leadData);
            
            if (!template) {
                // Fallback to basic message
                return {
                    success: true,
                    fallback: true,
                    content: this.getFallbackMessage(category, leadData),
                    segments: [this.getFallbackMessage(category, leadData)],
                    segmentCount: 1
                };
            }
            
            // Generate SMS
            return await this.generateSMSFromTemplate(template._id, leadData);
            
        } catch (error) {
            console.error('❌ Error generating SMS by category:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get fallback message when no template is available
     */
    getFallbackMessage(category, leadData = {}) {
        const firstName = leadData.firstName || leadData.name?.split(' ')[0] || 'there';
        const companyPhone = process.env.OPENPHONE_PHONE_NUMBER || '(234) 567-890';
        
        const fallbacks = {
            'welcome': `Hi ${firstName}! Thanks for your interest. We'll be in touch soon. - TownRanker`,
            'follow-up': `Hi ${firstName}, following up on your inquiry. Questions? Call ${companyPhone} - TownRanker`,
            'appointment': `Hi ${firstName}, reminder about our upcoming meeting. Looking forward to it! - TownRanker`,
            'proposal': `Hi ${firstName}, we've sent your project proposal. Questions? Call ${companyPhone} - TownRanker`,
            'project-update': `Hi ${firstName}, your project is progressing well. Update coming soon! - TownRanker`,
            'payment': `Hi ${firstName}, payment reminder sent to your email. Questions? Call ${companyPhone} - TownRanker`,
            'thank-you': `Hi ${firstName}, thank you for choosing TownRanker! We're excited to work with you.`,
            'lead-nurture': `Hi ${firstName}, still interested in working together? We're here to help! - TownRanker`,
            're-engagement': `Hi ${firstName}, we'd love to reconnect! Call ${companyPhone} when ready. - TownRanker`,
            'emergency': `Hi ${firstName}, urgent matter regarding your project. Please call ${companyPhone} ASAP.`
        };
        
        return fallbacks[category] || `Hi ${firstName}, thanks for your interest! Call ${companyPhone} - TownRanker`;
    }

    /**
     * Get all templates with filtering and pagination
     */
    async getTemplates(filters = {}, pagination = {}) {
        try {
            const {
                category,
                isActive = true,
                search,
                tags
            } = filters;
            
            const {
                page = 1,
                limit = 10,
                sortBy = 'priority',
                sortOrder = 'desc'
            } = pagination;
            
            // Build query
            const query = {};
            
            if (category) query.category = category;
            if (typeof isActive === 'boolean') query.isActive = isActive;
            if (search) {
                query.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                    { content: { $regex: search, $options: 'i' } }
                ];
            }
            if (tags && tags.length > 0) {
                query.tags = { $in: tags };
            }
            
            // Build sort
            const sort = {};
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
            
            // Execute query
            const templates = await SMSTemplate.find(query)
                .sort(sort)
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .exec();
            
            const total = await SMSTemplate.countDocuments(query);
            
            return {
                success: true,
                templates,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
            
        } catch (error) {
            console.error('❌ Error getting templates:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create new SMS template
     */
    async createTemplate(templateData) {
        try {
            // Validate required fields
            if (!templateData.name || !templateData.content) {
                throw new Error('Template name and content are required');
            }
            
            // Check for duplicate names
            const existingTemplate = await SMSTemplate.findOne({ 
                name: templateData.name 
            });
            
            if (existingTemplate) {
                throw new Error('Template name already exists');
            }
            
            // Add default values
            const template = new SMSTemplate({
                ...templateData,
                availableTags: templateData.availableTags || this.getStandardMergeTags(),
                version: 1,
                createdBy: templateData.createdBy || 'system'
            });
            
            await template.save();
            
            console.log(`✅ Created SMS template: ${template.name}`);
            return {
                success: true,
                template
            };
            
        } catch (error) {
            console.error('❌ Error creating template:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update existing SMS template
     */
    async updateTemplate(templateId, updateData) {
        try {
            const template = await SMSTemplate.findById(templateId);
            
            if (!template) {
                throw new Error('Template not found');
            }
            
            // Update fields
            Object.keys(updateData).forEach(key => {
                if (key !== '_id' && key !== 'createdAt') {
                    template[key] = updateData[key];
                }
            });
            
            // Increment version
            template.version += 1;
            template.updatedBy = updateData.updatedBy || 'system';
            
            await template.save();
            
            console.log(`✅ Updated SMS template: ${template.name}`);
            return {
                success: true,
                template
            };
            
        } catch (error) {
            console.error('❌ Error updating template:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Delete SMS template
     */
    async deleteTemplate(templateId) {
        try {
            const template = await SMSTemplate.findById(templateId);
            
            if (!template) {
                throw new Error('Template not found');
            }
            
            // Soft delete by deactivating
            template.isActive = false;
            await template.save();
            
            console.log(`🗑️  Deactivated SMS template: ${template.name}`);
            return {
                success: true,
                message: 'Template deactivated successfully'
            };
            
        } catch (error) {
            console.error('❌ Error deleting template:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Preview SMS template with sample data
     */
    async previewTemplate(templateId, sampleData = {}) {
        try {
            const template = await SMSTemplate.findById(templateId);
            
            if (!template) {
                throw new Error('Template not found');
            }
            
            // Use sample data if provided, otherwise use defaults
            const previewData = {
                customerName: 'John Smith',
                firstName: 'John',
                lastName: 'Smith',
                companyName: 'ABC Corporation',
                phone: '(555) 123-4567',
                email: 'john@example.com',
                projectType: 'business website',
                budget: 5000,
                timeline: '4-6 weeks',
                status: 'new',
                source: 'website',
                ...sampleData
            };
            
            // Generate preview
            const result = template.generateSMS(previewData);
            
            return {
                success: true,
                preview: result,
                sampleData: previewData,
                template: {
                    id: template._id,
                    name: template.name,
                    category: template.category,
                    originalContent: template.content
                }
            };
            
        } catch (error) {
            console.error('❌ Error previewing template:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get template usage statistics
     */
    async getTemplateStats(templateId) {
        try {
            const template = await SMSTemplate.findById(templateId);
            
            if (!template) {
                throw new Error('Template not found');
            }
            
            return {
                success: true,
                stats: {
                    id: template._id,
                    name: template.name,
                    category: template.category,
                    usageCount: template.usageCount,
                    successRate: template.successRate,
                    lastUsedDate: template.lastUsedDate,
                    createdAt: template.createdAt,
                    updatedAt: template.updatedAt,
                    version: template.version,
                    variants: template.variants.map(v => ({
                        name: v.name,
                        usageCount: v.usageCount,
                        conversionRate: v.conversionRate
                    }))
                }
            };
            
        } catch (error) {
            console.error('❌ Error getting template stats:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new SMSTemplateService();