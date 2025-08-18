const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/townranker', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ Connected to MongoDB');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
});

// Lead Schema
const leadSchema = new mongoose.Schema({
    projectType: {
        type: String,
        required: false,
        enum: ['business', 'ecommerce', 'webapp', 'landing', 'business-website', 'ecommerce-store', 'web-application', 'landing-page']
    },
    budget: {
        type: Number,
        required: false,
        default: 0
    },
    timeline: {
        type: String,
        required: false,
        enum: ['asap', '1-2months', '3-4months']
    },
    features: [{
        type: String
    }],
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
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
    message: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['new', 'contacted', 'qualified', 'proposal', 'closed-won', 'closed-lost'],
        default: 'new'
    },
    source: {
        type: String,
        default: 'website'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    // Email tracking fields
    emailCount: {
        type: Number,
        default: 0
    },
    lastContacted: {
        type: Date
    },
    lastEmailOpened: {
        type: Date
    },
    emailOpens: [{
        timestamp: { type: Date, default: Date.now },
        userAgent: String,
        ip: String
    }],
    emailHistory: [{
        subject: { type: String, required: true },
        body: { type: String, required: true },
        template: String,
        sentAt: { type: Date, default: Date.now },
        messageId: String,
        status: { type: String, enum: ['sent', 'draft', 'failed'], default: 'sent' },
        openCount: { type: Number, default: 0 },
        lastOpened: Date
    }],
    // Customer notes field
    notes: [{
        content: { type: String, required: true },
        author: { type: String, default: 'Admin' },
        priority: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
        createdAt: { type: Date, default: Date.now }
    }],
    // Additional customer tracking fields
    tags: [String],
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    assignedTo: String,
    // Interaction timeline
    interactions: [{
        type: { type: String, enum: ['email', 'call', 'meeting', 'status', 'note'], required: true },
        title: { type: String, required: true },
        description: String,
        timestamp: { type: Date, default: Date.now },
        metadata: {
            emailSubject: String,
            duration: Number,
            outcome: String
        }
    }]
});

// Create Lead model
const Lead = mongoose.model('Lead', leadSchema);

const { router: authRoutes } = require('./routes/auth');

// Email transporter setup
const fs = require('fs').promises;
const createEmailTransporter = () => {
    // Use environment variables for production only if properly configured
    if (process.env.EMAIL_SERVICE && 
        process.env.EMAIL_USER && 
        process.env.EMAIL_PASS &&
        process.env.EMAIL_USER !== 'your-email@gmail.com') {
        return nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    }
    
    // Fallback to file logging in development
    return {
        sendMail: async (options) => {
            const timestamp = new Date().toISOString();
            const emailLog = {
                timestamp,
                from: options.from,
                to: options.to,
                subject: options.subject,
                messageId: `dev-${Date.now()}`,
                html: options.html
            };
            
            // Log to console
            console.log('📧 Email sent (Dev Mode):');
            console.log(`   To: ${options.to}`);
            console.log(`   Subject: ${options.subject}`);
            console.log(`   Message ID: ${emailLog.messageId}`);
            
            // Save to file for review
            const logPath = '/root/townranker/email-logs.json';
            let logs = [];
            try {
                const existing = await fs.readFile(logPath, 'utf8');
                logs = JSON.parse(existing);
            } catch (e) {
                // File doesn't exist yet
            }
            logs.push(emailLog);
            // Keep only last 50 emails
            if (logs.length > 50) logs = logs.slice(-50);
            await fs.writeFile(logPath, JSON.stringify(logs, null, 2));
            
            // Also save HTML to separate file for easy viewing
            const htmlPath = `/root/townranker/emails/${emailLog.messageId}.html`;
            await fs.mkdir('/root/townranker/emails', { recursive: true });
            await fs.writeFile(htmlPath, options.html);
            console.log(`   HTML saved to: ${htmlPath}`);
            
            return { messageId: emailLog.messageId };
        }
    };
};

const transporter = createEmailTransporter();

// Helper function to format budget
const formatBudget = (budget) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(budget);
};

// Helper function to get package name based on budget
const getPackageName = (budget) => {
    if (budget < 1000) return 'Starter Package';
    if (budget < 5000) return 'Growth Package';
    if (budget < 10000) return 'Professional Package';
    if (budget < 25000) return 'Business Package';
    return 'Enterprise Package';
};

// API Routes

// Mount auth routes
app.use('/api/auth', authRoutes);


// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Submit contact form
app.post('/api/contact', async (req, res) => {
    try {
        const leadData = req.body;
        
        // Validate required fields
        if (!leadData.name || !leadData.email || !leadData.phone) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }
        
        // Create new lead
        const lead = new Lead(leadData);
        await lead.save();
        
        
        // Prepare email content
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">🎉 New Lead from TownRanker!</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                    <h2 style="color: #1f2937; margin-bottom: 20px;">Lead Details:</h2>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="color: #6366f1; margin-top: 0;">Contact Information</h3>
                        <p><strong>Name:</strong> ${lead.name}</p>
                        <p><strong>Email:</strong> ${lead.email}</p>
                        <p><strong>Phone:</strong> ${lead.phone}</p>
                        ${lead.company ? `<p><strong>Company:</strong> ${lead.company}</p>` : ''}
                    </div>
                    
                    ${lead.projectType || lead.budget || lead.timeline ? `
                    <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="color: #6366f1; margin-top: 0;">Project Requirements</h3>
                        ${lead.projectType ? `<p><strong>Project Type:</strong> ${lead.projectType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</p>` : ''}
                        ${lead.budget ? `<p><strong>Budget:</strong> ${formatBudget(lead.budget)} (${getPackageName(lead.budget)})</p>` : ''}
                        ${lead.timeline ? `<p><strong>Timeline:</strong> ${lead.timeline === 'asap' ? 'ASAP' : lead.timeline.replace('-', ' to ')}</p>` : ''}
                        ${lead.features && lead.features.length > 0 ? 
                            `<p><strong>Features Requested:</strong></p>
                            <ul>${lead.features.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
                        ${lead.message ? `<p><strong>Additional Message:</strong><br>${lead.message}</p>` : ''}
                    </div>` : ''}
                    
                    <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
                        <p style="margin: 0; color: #92400e;"><strong>⏰ Action Required:</strong> Contact this lead within 2 hours as promised!</p>
                    </div>
                </div>
                <div style="background: #1f2937; padding: 20px; text-align: center;">
                    <p style="color: #9ca3af; margin: 0;">This lead was captured from the TownRanker website</p>
                    <p style="color: #9ca3af; margin: 5px 0;">Lead ID: ${lead._id}</p>
                </div>
            </div>
        `;
        
        // Send notification email
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_FROM || '"TownRanker Website" <noreply@townranker.com>',
                to: process.env.NOTIFICATION_EMAIL || 'admin@townranker.com',
                subject: `🚀 New Lead: ${lead.name} - ${getPackageName(lead.budget)}`,
                html: emailHtml
            });
            console.log('✅ Notification email sent');
        } catch (emailError) {
            console.error('Email send error:', emailError);
            // Don't fail the request if email fails
        }
        
        // Send confirmation email to the lead
        const confirmationHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">Welcome to TownRanker!</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                    <h2 style="color: #1f2937;">Hi ${lead.name.split(' ')[0]},</h2>
                    <p style="color: #4b5563; line-height: 1.6;">
                        Thank you for choosing TownRanker to build your digital empire! We've received your project details and are already excited to work with you.
                    </p>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #6366f1; margin-top: 0;">What Happens Next?</h3>
                        <div style="margin: 15px 0;">
                            <p style="margin: 10px 0;"><strong>📧 Within 1 hour:</strong> You'll receive a detailed project brief</p>
                            <p style="margin: 10px 0;"><strong>📞 Within 2 hours:</strong> Our specialist will call you to discuss your project</p>
                            <p style="margin: 10px 0;"><strong>🎯 Within 24 hours:</strong> We'll schedule your strategy session</p>
                        </div>
                    </div>
                    
                    <div style="background: #ede9fe; padding: 20px; border-radius: 8px;">
                        <h3 style="color: #5b21b6; margin-top: 0;">Your Project Summary:</h3>
                        <p><strong>Project Type:</strong> ${lead.projectType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</p>
                        <p><strong>Budget Range:</strong> ${formatBudget(lead.budget)}</p>
                        <p><strong>Timeline:</strong> ${lead.timeline === 'asap' ? 'ASAP' : lead.timeline.replace('-', ' to ')}</p>
                    </div>
                    
                    <p style="color: #4b5563; line-height: 1.6; margin-top: 20px;">
                        While you wait, feel free to check out our portfolio at <a href="https://townranker.com" style="color: #6366f1;">townranker.com</a>
                    </p>
                </div>
                <div style="background: #1f2937; padding: 20px; text-align: center;">
                    <p style="color: white; margin: 0; font-weight: bold;">Let's Build Your Empire Together!</p>
                    <p style="color: #9ca3af; margin: 10px 0;">TownRanker - Premium Web Development & Digital Marketing</p>
                </div>
            </div>
        `;
        
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_FROM || '"TownRanker" <hello@townranker.com>',
                to: lead.email,
                subject: '🎉 Welcome to TownRanker - Your Project is Our Priority!',
                html: confirmationHtml
            });
            console.log('✅ Confirmation email sent to lead');
        } catch (emailError) {
            console.error('Confirmation email error:', emailError);
        }
        
        // Send success response
        res.json({
            success: true,
            message: 'Thank you! We\'ll contact you within 2 hours.',
            leadId: lead._id
        });
        
    } catch (error) {
        console.error('Error saving lead:', error);
        res.status(500).json({
            success: false,
            message: 'Something went wrong. Please try again or call us directly.'
        });
    }
});

// Get all leads (for admin dashboard)
app.get('/api/leads', async (req, res) => {
    try {
        // Basic authentication check (implement proper auth in production)
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN || 'dev-token'}`) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        
        const leads = await Lead.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            count: leads.length,
            leads
        });
    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching leads'
        });
    }
});

// Update lead status
app.patch('/api/leads/:id', async (req, res) => {
    try {
        // Basic authentication check
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN || 'dev-token'}`) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        
        const { status } = req.body;
        const lead = await Lead.findByIdAndUpdate(
            req.params.id,
            { status, updatedAt: Date.now() },
            { new: true }
        );
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }
        
        res.json({
            success: true,
            lead
        });
    } catch (error) {
        console.error('Error updating lead:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating lead'
        });
    }
});

// Import email templates
const emailTemplates = require('./email-templates');

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
    try {
        const { email } = req.body;
        const testEmail = email || process.env.NOTIFICATION_EMAIL || 'admin@townranker.com';
        
        const testHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">🧪 Test Email from TownRanker</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                    <h2 style="color: #1f2937;">Email System Test</h2>
                    <p style="color: #4b5563; line-height: 1.6;">
                        This is a test email to verify that the email system is working correctly.
                    </p>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #6366f1;">System Information:</h3>
                        <p><strong>Server Time:</strong> ${new Date().toLocaleString()}</p>
                        <p><strong>MongoDB Status:</strong> ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}</p>
                        <p><strong>Email Service:</strong> ${process.env.EMAIL_SERVICE || 'Console (Dev Mode)'}</p>
                        <p><strong>Recipient:</strong> ${testEmail}</p>
                    </div>
                    
                    <div style="background: #d1fae5; padding: 15px; border-radius: 8px; border-left: 4px solid #10b981;">
                        <p style="margin: 0; color: #065f46;">✅ If you received this email, the system is working correctly!</p>
                    </div>
                </div>
                <div style="background: #1f2937; padding: 20px; text-align: center;">
                    <p style="color: #9ca3af; margin: 0;">TownRanker Email System Test</p>
                </div>
            </div>
        `;
        
        const result = await transporter.sendMail({
            from: process.env.EMAIL_FROM || '"TownRanker Test" <test@townranker.com>',
            to: testEmail,
            subject: '🧪 TownRanker Email System Test',
            html: testHtml
        });
        
        res.json({
            success: true,
            message: 'Test email sent successfully',
            recipient: testEmail,
            messageId: result.messageId
        });
        
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send test email',
            error: error.message
        });
    }
});

// Send 1-hour follow-up email (Project Brief)
app.post('/api/send-follow-up-1hr', async (req, res) => {
    try {
        const { leadId, email } = req.body;
        
        // For testing, create a mock lead if no leadId provided
        let lead;
        if (leadId) {
            lead = await Lead.findById(leadId);
            if (!lead) {
                return res.status(404).json({ success: false, message: 'Lead not found' });
            }
        } else {
            // Mock lead for testing
            lead = {
                _id: 'TEST-' + Date.now(),
                name: 'Test User',
                email: email || 'rank@townranker.com',
                projectType: req.body.projectType || 'business',
                budget: req.body.budget || 5000,
                timeline: req.body.timeline || '1-2months',
                features: req.body.features || []
            };
        }
        
        const emailHtml = emailTemplates.getOneHourFollowUpEmail(lead);
        
        const result = await transporter.sendMail({
            from: process.env.EMAIL_FROM || '"TownRanker" <hello@townranker.com>',
            to: lead.email,
            subject: `📋 ${lead.name.split(' ')[0]}, Your Project Brief is Ready!`,
            html: emailHtml
        });
        
        res.json({
            success: true,
            message: '1-hour follow-up email sent successfully',
            recipient: lead.email,
            messageId: result.messageId
        });
        
    } catch (error) {
        console.error('1-hour follow-up email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send follow-up email',
            error: error.message
        });
    }
});

// Send 24-hour follow-up email (Strategy Session)
app.post('/api/send-follow-up-24hr', async (req, res) => {
    try {
        const { leadId, email } = req.body;
        
        // For testing, create a mock lead if no leadId provided
        let lead;
        if (leadId) {
            lead = await Lead.findById(leadId);
            if (!lead) {
                return res.status(404).json({ success: false, message: 'Lead not found' });
            }
        } else {
            // Mock lead for testing
            lead = {
                _id: 'TEST-' + Date.now(),
                name: 'Test User',
                email: email || 'rank@townranker.com',
                projectType: req.body.projectType || 'business',
                budget: req.body.budget || 5000,
                timeline: req.body.timeline || '1-2months'
            };
        }
        
        const emailHtml = emailTemplates.getTwentyFourHourFollowUpEmail(lead);
        
        const result = await transporter.sendMail({
            from: process.env.EMAIL_FROM || '"TownRanker" <hello@townranker.com>',
            to: lead.email,
            subject: `🗓️ ${lead.name.split(' ')[0]}, Schedule Your Strategy Session`,
            html: emailHtml
        });
        
        res.json({
            success: true,
            message: '24-hour follow-up email sent successfully',
            recipient: lead.email,
            messageId: result.messageId
        });
        
    } catch (error) {
        console.error('24-hour follow-up email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send follow-up email',
            error: error.message
        });
    }
});

// Email open tracking endpoint
app.get('/api/track-email-open/:trackingId', async (req, res) => {
    try {
        const { trackingId } = req.params;
        
        // Log the email open
        console.log(`📧 Email opened: ${trackingId} at ${new Date().toISOString()}`);
        
        // Find and update the lead with email open data
        const lead = await Lead.findById(trackingId);
        if (lead) {
            const openData = {
                timestamp: new Date(),
                userAgent: req.get('User-Agent'),
                ip: req.ip || req.connection.remoteAddress
            };
            
            // Update the most recent email in history with open data
            const updatedLead = await Lead.findByIdAndUpdate(trackingId, {
                $push: {
                    emailOpens: openData
                },
                lastEmailOpened: new Date()
            }, { new: true });
            
            // Update the most recent email's open count
            if (updatedLead.emailHistory && updatedLead.emailHistory.length > 0) {
                const mostRecentEmail = updatedLead.emailHistory[updatedLead.emailHistory.length - 1];
                mostRecentEmail.openCount = (mostRecentEmail.openCount || 0) + 1;
                mostRecentEmail.lastOpened = new Date();
                await updatedLead.save();
            }
            
            console.log(`✅ Email open tracked for lead: ${lead.name}`);
            
            // Send notification email about the email open
            try {
                const openTime = new Date().toLocaleString('en-US', { 
                    timeZone: 'America/New_York',
                    dateStyle: 'full',
                    timeStyle: 'short'
                });
                
                const deviceInfo = req.get('User-Agent');
                const location = req.ip || req.connection.remoteAddress || 'Unknown';
                
                const notificationHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #10b981 0%, #065f46 100%); padding: 20px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 24px;">📧 Email Opened!</h1>
                        </div>
                        <div style="padding: 30px; background: #f0fdf4; line-height: 1.6;">
                            <h2 style="color: #065f46; margin-top: 0;">Great news! Your email was just opened.</h2>
                            
                            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
                                <h3 style="color: #065f46; margin-top: 0;">📋 Customer Details</h3>
                                <p><strong>Name:</strong> ${lead.name}</p>
                                <p><strong>Email:</strong> ${lead.email}</p>
                                <p><strong>Company:</strong> ${lead.company || 'Not provided'}</p>
                                <p><strong>Project:</strong> ${lead.projectType}</p>
                                <p><strong>Budget:</strong> $${(lead.budget || 0).toLocaleString()}</p>
                            </div>
                            
                            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                                <h3 style="color: #1e40af; margin-top: 0;">🕒 Open Details</h3>
                                <p><strong>Opened at:</strong> ${openTime}</p>
                                <p><strong>Device/Browser:</strong> ${deviceInfo}</p>
                                <p><strong>Location:</strong> ${location}</p>
                            </div>
                            
                            <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="color: #92400e; margin-top: 0;">💡 Next Steps</h3>
                                <p>This is a great time to follow up! They're actively engaging with your emails.</p>
                                <p>Consider:</p>
                                <ul>
                                    <li>Sending a personalized follow-up</li>
                                    <li>Scheduling a call</li>
                                    <li>Sharing additional project examples</li>
                                </ul>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="https://townranker.com/admin-dashboard.html" 
                                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                          color: white; 
                                          padding: 15px 30px; 
                                          border-radius: 8px; 
                                          text-decoration: none; 
                                          display: inline-block; 
                                          font-weight: bold;">
                                    View Customer Profile →
                                </a>
                            </div>
                        </div>
                        <div style="background: #1f2937; padding: 20px; text-align: center;">
                            <p style="color: white; margin: 0; font-weight: bold;">TownRanker Email Tracking</p>
                            <p style="color: #9ca3af; margin: 5px 0; font-size: 14px;">Stay on top of customer engagement</p>
                        </div>
                    </div>
                `;
                
                await transporter.sendMail({
                    from: process.env.EMAIL_FROM || '"TownRanker Tracking" <tracking@townranker.com>',
                    to: 'rank@townranker.com',
                    subject: `📧 ${lead.name} opened your email - ${lead.projectType} project`,
                    html: notificationHtml
                });
                
                console.log(`📬 Email open notification sent to rank@townranker.com for ${lead.name}`);
            } catch (emailError) {
                console.error('Failed to send email open notification:', emailError);
                // Don't fail the tracking if notification email fails
            }
        }
        
        // Return a 1x1 transparent pixel
        const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
        
        res.set({
            'Content-Type': 'image/png',
            'Content-Length': pixel.length,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        res.send(pixel);
    } catch (error) {
        console.error('Email tracking error:', error);
        // Still return the pixel even if tracking fails
        const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
        res.set('Content-Type', 'image/png');
        res.send(pixel);
    }
});

// Get email history for a customer
app.get('/api/leads/:id/email-history', async (req, res) => {
    try {
        const { id } = req.params;
        
        const lead = await Lead.findById(id);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        
        // Return email history sorted by most recent first
        const emailHistory = (lead.emailHistory || [])
            .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
            .map(email => ({
                _id: email._id,
                subject: email.subject,
                body: email.body,
                template: email.template,
                sentAt: email.sentAt,
                messageId: email.messageId,
                status: email.status,
                openCount: email.openCount || 0,
                lastOpened: email.lastOpened,
                preview: email.body.substring(0, 100) + (email.body.length > 100 ? '...' : '')
            }));
        
        res.json({
            success: true,
            data: emailHistory
        });
    } catch (error) {
        console.error('Email history fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch email history',
            error: error.message
        });
    }
});

// Add note to customer
app.post('/api/leads/:id/notes', async (req, res) => {
    try {
        const { id } = req.params;
        const { content, priority = 'low' } = req.body;
        
        if (!content) {
            return res.status(400).json({
                success: false,
                message: 'Note content is required'
            });
        }
        
        const lead = await Lead.findByIdAndUpdate(id, {
            $push: {
                notes: {
                    content: content,
                    author: 'Admin',
                    priority: priority,
                    createdAt: new Date()
                }
            }
        }, { new: true });
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Note added successfully',
            note: lead.notes[lead.notes.length - 1]
        });
    } catch (error) {
        console.error('Add note error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add note',
            error: error.message
        });
    }
});

// Get customer notes
app.get('/api/leads/:id/notes', async (req, res) => {
    try {
        const { id } = req.params;
        
        const lead = await Lead.findById(id);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        
        // Return notes sorted by most recent first
        const notes = (lead.notes || [])
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({
            success: true,
            data: notes
        });
    } catch (error) {
        console.error('Get notes error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notes',
            error: error.message
        });
    }
});

// Get customer interactions (timeline)
app.get('/api/leads/:id/interactions', async (req, res) => {
    try {
        const { id } = req.params;
        
        const lead = await Lead.findById(id);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        
        // Return interactions sorted by most recent first
        const interactions = (lead.interactions || [])
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        res.json({
            success: true,
            data: interactions
        });
    } catch (error) {
        console.error('Get interactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch interactions',
            error: error.message
        });
    }
});

// Add interaction to customer
app.post('/api/leads/:id/interactions', async (req, res) => {
    try {
        const { id } = req.params;
        const { type, title, description, metadata = {} } = req.body;
        
        if (!type || !title) {
            return res.status(400).json({
                success: false,
                message: 'Type and title are required'
            });
        }
        
        const lead = await Lead.findByIdAndUpdate(id, {
            $push: {
                interactions: {
                    type: type,
                    title: title,
                    description: description,
                    timestamp: new Date(),
                    metadata: metadata
                }
            }
        }, { new: true });
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Interaction added successfully',
            interaction: lead.interactions[lead.interactions.length - 1]
        });
    } catch (error) {
        console.error('Add interaction error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add interaction',
            error: error.message
        });
    }
});

// Get email tracking data for a customer
app.get('/api/leads/:id/email-tracking', async (req, res) => {
    try {
        const { id } = req.params;
        
        const lead = await Lead.findById(id);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        
        res.json({
            success: true,
            data: {
                emailCount: lead.emailCount || 0,
                lastContacted: lead.lastContacted,
                lastEmailOpened: lead.lastEmailOpened,
                emailOpens: lead.emailOpens || [],
                openRate: lead.emailOpens && lead.emailCount ? 
                    ((lead.emailOpens.length / lead.emailCount) * 100).toFixed(1) : '0'
            }
        });
    } catch (error) {
        console.error('Email tracking fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch email tracking data',
            error: error.message
        });
    }
});

// Send custom email from Communication tab
app.post('/api/send-customer-email', async (req, res) => {
    try {
        const { leadId, subject, body, template } = req.body;

        // Validate input
        if (!leadId || !subject || !body) {
            return res.status(400).json({
                success: false,
                message: 'Lead ID, subject, and body are required'
            });
        }

        // Find the lead
        const lead = await Lead.findById(leadId);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        if (!lead.email) {
            return res.status(400).json({
                success: false,
                message: 'Customer email not available'
            });
        }

        // Create professional HTML email format with tracking pixel
        const trackingPixelUrl = `${req.protocol}://${req.get('host')}/api/track-email-open/${lead._id}`;
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">${subject}</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb; line-height: 1.6; color: #1f2937;">
                    ${body.replace(/\n/g, '<br>')}
                </div>
                <div style="background: #1f2937; padding: 20px; text-align: center;">
                    <p style="color: white; margin: 0; font-weight: bold;">TownRanker</p>
                    <p style="color: #9ca3af; margin: 5px 0; font-size: 14px;">Professional Web Development & Digital Solutions</p>
                    <p style="color: #9ca3af; margin: 5px 0; font-size: 12px;">
                        Customer ID: ${lead._id}
                    </p>
                </div>
                <!-- Email tracking pixel -->
                <img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />
            </div>
        `;

        // Send the email using existing transporter
        const result = await transporter.sendMail({
            from: process.env.EMAIL_FROM || '"TownRanker" <hello@townranker.com>',
            to: lead.email,
            subject: subject,
            html: emailHtml
        });

        // Save email to history, add interaction, and update lead's last contacted time
        await Lead.findByIdAndUpdate(leadId, {
            lastContacted: new Date(),
            $inc: { emailCount: 1 },
            $push: {
                emailHistory: {
                    subject: subject,
                    body: body,
                    template: template || '',
                    sentAt: new Date(),
                    messageId: result.messageId,
                    status: 'sent'
                },
                interactions: {
                    type: 'email',
                    title: 'Email Sent',
                    description: subject,
                    timestamp: new Date(),
                    metadata: {
                        emailSubject: subject
                    }
                }
            }
        });

        res.json({
            success: true,
            message: 'Email sent successfully',
            recipient: lead.email,
            messageId: result.messageId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Customer email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send email',
            error: error.message
        });
    }
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 TownRanker server running on port ${PORT}`);
    console.log(`📍 Visit http://localhost:${PORT} to view the website`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    await mongoose.connection.close();
    process.exit(0);
});