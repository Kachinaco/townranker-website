const express = require('express');
const router = express.Router();
const smsTemplateService = require('../services/smsTemplateService');
const SMSTemplate = require('../models/SMSTemplate');
const Lead = require('../models/Lead');
const Customer = require('../models/Customer');

// Initialize default templates (admin only)
router.post('/initialize', async (req, res) => {
    try {
        const result = await smsTemplateService.initializeDefaultTemplates();
        res.json(result);
    } catch (error) {
        console.error('Error initializing templates:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initialize templates',
            details: error.message
        });
    }
});

// Get all SMS templates with filtering and pagination
router.get('/', async (req, res) => {
    try {
        const filters = {
            category: req.query.category,
            isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
            search: req.query.search,
            tags: req.query.tags ? req.query.tags.split(',') : undefined
        };

        const pagination = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 10,
            sortBy: req.query.sortBy || 'priority',
            sortOrder: req.query.sortOrder || 'desc'
        };

        const result = await smsTemplateService.getTemplates(filters, pagination);
        res.json(result);
    } catch (error) {
        console.error('Error getting templates:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get templates',
            details: error.message
        });
    }
});

// Get template by ID
router.get('/:id', async (req, res) => {
    try {
        const template = await SMSTemplate.findById(req.params.id);
        
        if (!template) {
            return res.status(404).json({
                success: false,
                error: 'Template not found'
            });
        }

        res.json({
            success: true,
            template
        });
    } catch (error) {
        console.error('Error getting template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get template',
            details: error.message
        });
    }
});

// Create new SMS template
router.post('/', async (req, res) => {
    try {
        const templateData = {
            ...req.body,
            createdBy: 'admin' // Could be extracted from auth
        };

        const result = await smsTemplateService.createTemplate(templateData);
        
        if (result.success) {
            res.status(201).json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create template',
            details: error.message
        });
    }
});

// Update SMS template
router.put('/:id', async (req, res) => {
    try {
        const updateData = {
            ...req.body,
            updatedBy: 'admin' // Could be extracted from auth
        };

        const result = await smsTemplateService.updateTemplate(req.params.id, updateData);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update template',
            details: error.message
        });
    }
});

// Delete SMS template (soft delete - deactivate)
router.delete('/:id', async (req, res) => {
    try {
        const result = await smsTemplateService.deleteTemplate(req.params.id);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete template',
            details: error.message
        });
    }
});

// Preview SMS template with sample or custom data
router.post('/:id/preview', async (req, res) => {
    try {
        const sampleData = req.body.sampleData || {};
        const result = await smsTemplateService.previewTemplate(req.params.id, sampleData);
        
        res.json(result);
    } catch (error) {
        console.error('Error previewing template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to preview template',
            details: error.message
        });
    }
});

// Get template usage statistics
router.get('/:id/stats', async (req, res) => {
    try {
        const result = await smsTemplateService.getTemplateStats(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Error getting template stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get template stats',
            details: error.message
        });
    }
});

// Generate SMS for specific lead using template
router.post('/generate/:leadId', async (req, res) => {
    try {
        const { leadId } = req.params;
        const { templateId, category } = req.body;

        // Get lead data
        let leadData = await Lead.findById(leadId);
        if (!leadData) {
            leadData = await Customer.findById(leadId);
        }
        
        if (!leadData) {
            return res.status(404).json({
                success: false,
                error: 'Lead/Customer not found'
            });
        }

        let result;
        
        if (templateId) {
            // Use specific template
            result = await smsTemplateService.generateSMSFromTemplate(templateId, leadData.toObject());
        } else if (category) {
            // Find best template by category
            result = await smsTemplateService.generateSMSByCategory(category, leadData.toObject());
        } else {
            return res.status(400).json({
                success: false,
                error: 'Either templateId or category is required'
            });
        }

        res.json({
            success: true,
            leadData: {
                id: leadData._id,
                name: leadData.name,
                phone: leadData.phone,
                email: leadData.email,
                status: leadData.status,
                projectType: leadData.projectType,
                budget: leadData.budget
            },
            smsGeneration: result
        });
    } catch (error) {
        console.error('Error generating SMS for lead:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate SMS',
            details: error.message
        });
    }
});

// Find best template for lead
router.get('/best/:leadId/:category', async (req, res) => {
    try {
        const { leadId, category } = req.params;

        // Get lead data
        let leadData = await Lead.findById(leadId);
        if (!leadData) {
            leadData = await Customer.findById(leadId);
        }
        
        if (!leadData) {
            return res.status(404).json({
                success: false,
                error: 'Lead/Customer not found'
            });
        }

        const template = await smsTemplateService.findBestTemplate(category, leadData.toObject());
        
        if (!template) {
            return res.status(404).json({
                success: false,
                error: 'No suitable template found for this lead and category'
            });
        }

        res.json({
            success: true,
            template: {
                id: template._id,
                name: template.name,
                category: template.category,
                description: template.description,
                priority: template.priority,
                successRate: template.successRate,
                conditions: template.conditions
            },
            leadData: {
                id: leadData._id,
                name: leadData.name,
                status: leadData.status,
                projectType: leadData.projectType,
                budget: leadData.budget
            }
        });
    } catch (error) {
        console.error('Error finding best template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to find best template',
            details: error.message
        });
    }
});

// Get template categories with counts
router.get('/categories/stats', async (req, res) => {
    try {
        const categories = await SMSTemplate.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    totalUsage: { $sum: '$usageCount' },
                    averageSuccessRate: { $avg: '$successRate' },
                    lastUsed: { $max: '$lastUsedDate' }
                }
            },
            { $sort: { totalUsage: -1 } }
        ]);

        res.json({
            success: true,
            categories: categories.map(cat => ({
                category: cat._id,
                templateCount: cat.count,
                totalUsage: cat.totalUsage,
                averageSuccessRate: Math.round(cat.averageSuccessRate * 100) / 100,
                lastUsed: cat.lastUsed
            }))
        });
    } catch (error) {
        console.error('Error getting category stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get category stats',
            details: error.message
        });
    }
});

// Test template against multiple leads
router.post('/:id/test', async (req, res) => {
    try {
        const { id } = req.params;
        const { leadIds = [] } = req.body;

        const template = await SMSTemplate.findById(id);
        if (!template) {
            return res.status(404).json({
                success: false,
                error: 'Template not found'
            });
        }

        const results = [];
        
        for (const leadId of leadIds) {
            try {
                let leadData = await Lead.findById(leadId);
                if (!leadData) {
                    leadData = await Customer.findById(leadId);
                }
                
                if (leadData) {
                    const smsResult = template.generateSMS(leadData.toObject());
                    const matches = template.matchesConditions(leadData.toObject());
                    
                    results.push({
                        leadId: leadData._id,
                        leadName: leadData.name,
                        leadStatus: leadData.status,
                        matchesConditions: matches,
                        generatedSMS: smsResult,
                        withinLimits: smsResult.withinLimit,
                        segmentCount: smsResult.segmentCount
                    });
                }
            } catch (leadError) {
                results.push({
                    leadId,
                    error: leadError.message
                });
            }
        }

        res.json({
            success: true,
            template: {
                id: template._id,
                name: template.name,
                category: template.category
            },
            testResults: results,
            summary: {
                totalTested: results.length,
                successful: results.filter(r => !r.error).length,
                withinLimits: results.filter(r => r.withinLimits).length,
                matchingConditions: results.filter(r => r.matchesConditions).length
            }
        });
    } catch (error) {
        console.error('Error testing template:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test template',
            details: error.message
        });
    }
});

module.exports = router;