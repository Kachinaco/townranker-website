const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const Customer = require('../models/Customer');
const Project = require('../models/Project');
const Payment = require('../models/Payment');
const Proposal = require('../models/Proposal');
const Communication = require('../models/Communication');
const EmailTemplate = require('../models/EmailTemplate');
const { verifyToken } = require('./auth');

// Apply JWT auth to all CRM routes
router.use(verifyToken);

// ============== CUSTOMER ROUTES ==============

// Get all customers with filters
router.get('/customers', async (req, res) => {
    try {
        const { status, priority, search, sort = '-createdAt', limit = 50, page = 1 } = req.query;
        
        let query = {};
        
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (search) {
            query.$text = { $search: search };
        }
        
        const skip = (page - 1) * limit;
        
        const customers = await Customer
            .find(query)
            .sort(sort)
            .limit(parseInt(limit))
            .skip(skip)
            .populate('projects proposals payments');
            
        const total = await Customer.countDocuments(query);
        
        res.json({
            success: true,
            data: customers,
            pagination: {
                total,
                pages: Math.ceil(total / limit),
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single customer
router.get('/customers/:id', async (req, res) => {
    try {
        const customer = await Customer
            .findById(req.params.id)
            .populate('projects proposals payments communications');
            
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }
        
        res.json({ success: true, data: customer });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create customer
router.post('/customers', async (req, res) => {
    try {
        const customer = new Customer(req.body);
        await customer.save();
        res.status(201).json({ success: true, data: customer });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Update customer
router.put('/customers/:id', async (req, res) => {
    try {
        const customer = await Customer.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: Date.now() },
            { new: true, runValidators: true }
        );
        
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }
        
        res.json({ success: true, data: customer });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Add note to customer
router.post('/customers/:id/notes', async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id);
        
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }
        
        customer.notes.push({
            content: req.body.content,
            createdBy: req.body.createdBy || 'Admin'
        });
        
        await customer.save();
        res.json({ success: true, data: customer });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============== PROJECT ROUTES ==============

// Get all projects
router.get('/projects', async (req, res) => {
    try {
        const { status, customerId, sort = '-createdAt' } = req.query;
        
        let query = {};
        if (status) query.status = status;
        if (customerId) query.customer = customerId;
        
        const projects = await Project
            .find(query)
            .sort(sort)
            .populate('customer', 'name email company');
            
        res.json({ success: true, data: projects });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single project
router.get('/projects/:id', async (req, res) => {
    try {
        const project = await Project
            .findById(req.params.id)
            .populate('customer');
            
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }
        
        res.json({ success: true, data: project });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create project
router.post('/projects', async (req, res) => {
    try {
        const project = new Project(req.body);
        await project.save();
        
        // Add project to customer
        await Customer.findByIdAndUpdate(
            req.body.customer,
            { $push: { projects: project._id } }
        );
        
        res.status(201).json({ success: true, data: project });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Update project
router.put('/projects/:id', async (req, res) => {
    try {
        const project = await Project.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: Date.now() },
            { new: true, runValidators: true }
        );
        
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }
        
        res.json({ success: true, data: project });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Update project progress
router.patch('/projects/:id/progress', async (req, res) => {
    try {
        const { progress } = req.body;
        
        const project = await Project.findByIdAndUpdate(
            req.params.id,
            { progress, updatedAt: Date.now() },
            { new: true }
        );
        
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }
        
        res.json({ success: true, data: project });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Add time entry to project
router.post('/projects/:id/time', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }
        
        project.timeEntries.push(req.body);
        await project.save();
        
        res.json({ success: true, data: project });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============== PAYMENT ROUTES ==============

// Get all payments
router.get('/payments', async (req, res) => {
    try {
        const { status, customerId, projectId, sort = '-invoiceDate' } = req.query;
        
        let query = {};
        if (status) query.status = status;
        if (customerId) query.customer = customerId;
        if (projectId) query.project = projectId;
        
        const payments = await Payment
            .find(query)
            .sort(sort)
            .populate('customer', 'name email company')
            .populate('project', 'name');
            
        const stats = {
            total: await Payment.countDocuments(query),
            totalRevenue: payments.reduce((acc, p) => acc + p.total, 0),
            totalPaid: payments.reduce((acc, p) => acc + p.amountPaid, 0),
            totalDue: payments.reduce((acc, p) => acc + p.amountDue, 0)
        };
        
        res.json({ success: true, data: payments, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single payment
router.get('/payments/:id', async (req, res) => {
    try {
        const payment = await Payment
            .findById(req.params.id)
            .populate('customer project proposal');
            
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        
        res.json({ success: true, data: payment });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create payment/invoice
router.post('/payments', async (req, res) => {
    try {
        // Generate invoice number if not provided
        if (!req.body.invoiceNumber) {
            const count = await Payment.countDocuments();
            req.body.invoiceNumber = `INV-${String(count + 1).padStart(5, '0')}`;
        }
        
        const payment = new Payment(req.body);
        await payment.save();
        
        // Add payment to customer
        await Customer.findByIdAndUpdate(
            req.body.customer,
            { 
                $push: { payments: payment._id },
                $inc: { totalRevenue: payment.total }
            }
        );
        
        res.status(201).json({ success: true, data: payment });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Record payment
router.post('/payments/:id/pay', async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        
        payment.payments.push({
            amount: req.body.amount,
            date: req.body.date || Date.now(),
            method: req.body.method,
            reference: req.body.reference,
            notes: req.body.notes
        });
        
        await payment.save();
        
        // Update customer financial summary
        await Customer.findByIdAndUpdate(
            payment.customer,
            { 
                $inc: { 
                    totalPaid: req.body.amount,
                    outstandingBalance: -req.body.amount
                }
            }
        );
        
        res.json({ success: true, data: payment });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============== PROPOSAL ROUTES ==============

// Get all proposals
router.get('/proposals', async (req, res) => {
    try {
        const { status, customerId, sort = '-createdAt' } = req.query;
        
        let query = {};
        if (status) query.status = status;
        if (customerId) query.customer = customerId;
        
        const proposals = await Proposal
            .find(query)
            .sort(sort)
            .populate('customer', 'name email company')
            .populate('project', 'name');
            
        res.json({ success: true, data: proposals });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single proposal
router.get('/proposals/:id', async (req, res) => {
    try {
        const proposal = await Proposal
            .findById(req.params.id)
            .populate('customer project');
            
        if (!proposal) {
            return res.status(404).json({ success: false, message: 'Proposal not found' });
        }
        
        res.json({ success: true, data: proposal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create proposal
router.post('/proposals', async (req, res) => {
    try {
        const proposal = new Proposal(req.body);
        await proposal.save();
        
        // Add proposal to customer
        await Customer.findByIdAndUpdate(
            req.body.customer,
            { $push: { proposals: proposal._id } }
        );
        
        res.status(201).json({ success: true, data: proposal });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Accept/Reject proposal
router.patch('/proposals/:id/status', async (req, res) => {
    try {
        const { status, acceptedBy, rejectionReason } = req.body;
        
        const update = { 
            status, 
            updatedAt: Date.now() 
        };
        
        if (status === 'accepted') {
            update.acceptedBy = {
                ...acceptedBy,
                date: Date.now()
            };
        } else if (status === 'rejected') {
            update.rejectionReason = rejectionReason;
        }
        
        const proposal = await Proposal.findByIdAndUpdate(
            req.params.id,
            update,
            { new: true }
        );
        
        if (!proposal) {
            return res.status(404).json({ success: false, message: 'Proposal not found' });
        }
        
        // If accepted, update customer status
        if (status === 'accepted') {
            await Customer.findByIdAndUpdate(
                proposal.customer,
                { 
                    status: 'client',
                    convertedDate: Date.now()
                }
            );
        }
        
        res.json({ success: true, data: proposal });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============== ANALYTICS ROUTES ==============

// Get dashboard analytics
router.get('/analytics/dashboard', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let dateQuery = {};
        if (startDate || endDate) {
            dateQuery.createdAt = {};
            if (startDate) dateQuery.createdAt.$gte = new Date(startDate);
            if (endDate) dateQuery.createdAt.$lte = new Date(endDate);
        }
        
        // Customer stats
        const customerStats = {
            total: await Customer.countDocuments(),
            leads: await Customer.countDocuments({ status: 'lead' }),
            prospects: await Customer.countDocuments({ status: 'prospect' }),
            clients: await Customer.countDocuments({ status: 'client' }),
            newThisMonth: await Customer.countDocuments({
                createdAt: {
                    $gte: new Date(new Date().setDate(1))
                }
            })
        };
        
        // Project stats
        const projectStats = {
            total: await Project.countDocuments(),
            active: await Project.countDocuments({ status: 'in-progress' }),
            completed: await Project.countDocuments({ status: 'completed' }),
            onHold: await Project.countDocuments({ status: 'on-hold' })
        };
        
        // Financial stats
        const payments = await Payment.find(dateQuery);
        const financialStats = {
            totalRevenue: payments.reduce((acc, p) => acc + p.total, 0),
            totalPaid: payments.reduce((acc, p) => acc + p.amountPaid, 0),
            totalDue: payments.reduce((acc, p) => acc + p.amountDue, 0),
            overdueAmount: payments
                .filter(p => p.isOverdue)
                .reduce((acc, p) => acc + p.amountDue, 0)
        };
        
        // Proposal stats
        const proposalStats = {
            total: await Proposal.countDocuments(),
            sent: await Proposal.countDocuments({ status: 'sent' }),
            accepted: await Proposal.countDocuments({ status: 'accepted' }),
            pending: await Proposal.countDocuments({ 
                status: { $in: ['sent', 'viewed'] }
            }),
            conversionRate: await calculateConversionRate()
        };
        
        // Recent activities
        const recentCustomers = await Customer
            .find()
            .sort('-createdAt')
            .limit(5)
            .select('name email status createdAt');
            
        const recentProjects = await Project
            .find()
            .sort('-createdAt')
            .limit(5)
            .select('name status progress createdAt')
            .populate('customer', 'name');
        
        res.json({
            success: true,
            data: {
                customers: customerStats,
                projects: projectStats,
                financial: financialStats,
                proposals: proposalStats,
                recent: {
                    customers: recentCustomers,
                    projects: recentProjects
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper function for conversion rate
async function calculateConversionRate() {
    const total = await Proposal.countDocuments({ 
        status: { $in: ['accepted', 'rejected'] }
    });
    const accepted = await Proposal.countDocuments({ status: 'accepted' });
    
    if (total === 0) return 0;
    return Math.round((accepted / total) * 100);
}

// ============== EMAIL ROUTES ==============

// Email transporter (reuse from main server)
const createEmailTransporter = () => {
    if (process.env.EMAIL_SERVICE && 
        process.env.EMAIL_USER && 
        process.env.EMAIL_PASS) {
        return nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    }
    return null;
};

const transporter = createEmailTransporter();

// Get email templates
router.get('/emails/templates', async (req, res) => {
    try {
        const templates = await EmailTemplate.find({ isActive: true })
            .select('name category description subject')
            .sort('category name');
            
        res.json({ success: true, data: templates });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single template
router.get('/emails/templates/:id', async (req, res) => {
    try {
        const template = await EmailTemplate.findById(req.params.id);
        
        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }
        
        res.json({ success: true, data: template });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create email template
router.post('/emails/templates', async (req, res) => {
    try {
        const template = new EmailTemplate(req.body);
        await template.save();
        res.status(201).json({ success: true, data: template });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Send email
router.post('/emails/send', async (req, res) => {
    try {
        const { 
            customerId, 
            to, 
            subject, 
            body, 
            templateId,
            attachments,
            cc,
            bcc,
            scheduledDate
        } = req.body;
        
        // Get customer if provided
        let customer = null;
        if (customerId) {
            customer = await Customer.findById(customerId);
            if (!customer) {
                return res.status(404).json({ success: false, message: 'Customer not found' });
            }
        }
        
        // Process template if provided
        let emailSubject = subject;
        let emailBody = body;
        
        if (templateId) {
            const template = await EmailTemplate.findById(templateId);
            if (template) {
                const processed = template.processMergeTags({
                    customerName: customer?.name,
                    firstName: customer?.name.split(' ')[0],
                    companyName: customer?.company,
                    email: customer?.email,
                    phone: customer?.phone
                });
                emailSubject = processed.subject;
                emailBody = processed.body;
                
                // Increment template usage
                await template.incrementUsage();
            }
        }
        
        // Create communication record
        const communication = new Communication({
            customer: customerId,
            type: 'email',
            direction: 'outbound',
            subject: emailSubject,
            body: emailBody,
            bodyHtml: emailBody,
            from: {
                name: 'TownRanker',
                email: process.env.EMAIL_FROM || 'hello@townranker.com'
            },
            to: to || [{ email: customer?.email, name: customer?.name }],
            cc: cc,
            bcc: bcc,
            attachments: attachments,
            status: scheduledDate ? 'scheduled' : 'sending',
            scheduledDate: scheduledDate,
            template: templateId ? { id: templateId } : null
        });
        
        // Add tracking to email
        const trackedBody = communication.addTrackingToHtml(emailBody);
        
        // Send email if not scheduled
        if (!scheduledDate) {
            if (!transporter) {
                communication.status = 'failed';
                communication.error = {
                    message: 'Email service not configured',
                    date: new Date()
                };
                await communication.save();
                
                return res.status(500).json({
                    success: false,
                    message: 'Email service not configured'
                });
            }
            
            try {
                const toEmails = Array.isArray(to) ? 
                    to.map(t => t.email || t).join(', ') : 
                    to || customer?.email;
                
                const result = await transporter.sendMail({
                    from: process.env.EMAIL_FROM || '"TownRanker" <hello@townranker.com>',
                    to: toEmails,
                    cc: cc?.map(c => c.email || c).join(', '),
                    bcc: bcc?.map(b => b.email || b).join(', '),
                    subject: emailSubject,
                    html: trackedBody,
                    attachments: attachments?.map(a => ({
                        filename: a.filename,
                        path: a.url
                    }))
                });
                
                communication.status = 'sent';
                communication.sentDate = new Date();
                communication.emailId = result.messageId;
                
            } catch (emailError) {
                communication.status = 'failed';
                communication.error = {
                    message: emailError.message,
                    code: emailError.code,
                    date: new Date()
                };
            }
        }
        
        await communication.save();
        
        res.json({
            success: true,
            data: communication,
            message: scheduledDate ? 'Email scheduled' : 'Email sent successfully'
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Send bulk emails (campaign)
router.post('/emails/campaign', async (req, res) => {
    try {
        const {
            customerIds,
            customerFilter,
            subject,
            body,
            templateId,
            campaignName
        } = req.body;
        
        // Get customers
        let customers = [];
        if (customerIds && customerIds.length > 0) {
            customers = await Customer.find({ _id: { $in: customerIds } });
        } else if (customerFilter) {
            customers = await Customer.find(customerFilter);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Please provide customerIds or customerFilter'
            });
        }
        
        if (customers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No customers found'
            });
        }
        
        // Get template if provided
        let template = null;
        if (templateId) {
            template = await EmailTemplate.findById(templateId);
        }
        
        const campaignId = `campaign-${Date.now()}`;
        const results = [];
        
        // Send emails to each customer
        for (const customer of customers) {
            try {
                // Process template for this customer
                let emailSubject = subject;
                let emailBody = body;
                
                if (template) {
                    const processed = template.processMergeTags({
                        customerName: customer.name,
                        firstName: customer.name.split(' ')[0],
                        companyName: customer.company,
                        email: customer.email
                    });
                    emailSubject = processed.subject;
                    emailBody = processed.body;
                }
                
                // Create communication record
                const communication = new Communication({
                    customer: customer._id,
                    type: 'email',
                    direction: 'outbound',
                    subject: emailSubject,
                    body: emailBody,
                    bodyHtml: emailBody,
                    from: {
                        name: 'TownRanker',
                        email: process.env.EMAIL_FROM || 'hello@townranker.com'
                    },
                    to: [{ email: customer.email, name: customer.name }],
                    status: 'sending',
                    campaign: {
                        id: campaignId,
                        name: campaignName || 'Bulk Email Campaign'
                    },
                    template: templateId ? { id: templateId } : null
                });
                
                // Add tracking
                const trackedBody = communication.addTrackingToHtml(emailBody);
                
                // Send email
                if (transporter) {
                    const result = await transporter.sendMail({
                        from: process.env.EMAIL_FROM || '"TownRanker" <hello@townranker.com>',
                        to: customer.email,
                        subject: emailSubject,
                        html: trackedBody
                    });
                    
                    communication.status = 'sent';
                    communication.sentDate = new Date();
                    communication.emailId = result.messageId;
                } else {
                    communication.status = 'failed';
                    communication.error = {
                        message: 'Email service not configured',
                        date: new Date()
                    };
                }
                
                await communication.save();
                results.push({
                    customer: customer.name,
                    email: customer.email,
                    status: communication.status
                });
                
            } catch (error) {
                results.push({
                    customer: customer.name,
                    email: customer.email,
                    status: 'failed',
                    error: error.message
                });
            }
        }
        
        // Increment template usage if used
        if (template) {
            template.usageCount += customers.length;
            template.lastUsedDate = new Date();
            await template.save();
        }
        
        res.json({
            success: true,
            campaignId: campaignId,
            totalSent: results.filter(r => r.status === 'sent').length,
            totalFailed: results.filter(r => r.status === 'failed').length,
            results: results
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get email history for customer
router.get('/emails/history/:customerId', async (req, res) => {
    try {
        const communications = await Communication.find({
            customer: req.params.customerId,
            type: 'email'
        })
        .sort('-createdAt')
        .limit(50);
        
        res.json({ success: true, data: communications });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Track email open
router.get('/emails/track/:trackingId/pixel.gif', async (req, res) => {
    try {
        const communication = await Communication.findOne({ 
            trackingId: req.params.trackingId 
        });
        
        if (communication) {
            await communication.trackOpen(
                req.ip,
                req.get('user-agent')
            );
        }
        
        // Return 1x1 transparent gif
        const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
        res.writeHead(200, {
            'Content-Type': 'image/gif',
            'Content-Length': pixel.length,
            'Cache-Control': 'no-store, no-cache, must-revalidate, private'
        });
        res.end(pixel);
        
    } catch (error) {
        res.status(200).end();
    }
});

// Track email click
router.get('/emails/track/:trackingId/click', async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).send('Invalid URL');
        }
        
        const communication = await Communication.findOne({ 
            trackingId: req.params.trackingId 
        });
        
        if (communication) {
            await communication.trackClick(
                url,
                req.ip,
                req.get('user-agent')
            );
        }
        
        // Redirect to actual URL
        res.redirect(url);
        
    } catch (error) {
        res.redirect(req.query.url || '/');
    }
});

// Get email stats for dashboard
router.get('/emails/stats', async (req, res) => {
    try {
        const stats = {
            totalSent: await Communication.countDocuments({ 
                type: 'email', 
                status: { $in: ['sent', 'delivered', 'opened', 'clicked', 'replied'] }
            }),
            totalOpened: await Communication.countDocuments({ 
                type: 'email',
                openCount: { $gt: 0 }
            }),
            totalClicked: await Communication.countDocuments({ 
                type: 'email',
                clickCount: { $gt: 0 }
            }),
            avgOpenRate: 0,
            avgClickRate: 0
        };
        
        if (stats.totalSent > 0) {
            stats.avgOpenRate = Math.round((stats.totalOpened / stats.totalSent) * 100);
            stats.avgClickRate = Math.round((stats.totalClicked / stats.totalSent) * 100);
        }
        
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;