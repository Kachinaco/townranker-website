const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const http = require('http');
const socketIo = require('socket.io');
const openphoneSync = require('./services/openphoneSync');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Route for /login to serve login.html
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Make io available to routes
app.set('io', io);

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('👤 Client connected:', socket.id);

    // Join customer room for real-time messaging
    socket.on('join_customer_room', (customerId) => {
        socket.join(`customer_${customerId}`);
        console.log(`👤 Socket ${socket.id} joined customer room: ${customerId}`);
    });

    // Leave customer room
    socket.on('leave_customer_room', (customerId) => {
        socket.leave(`customer_${customerId}`);
        console.log(`👤 Socket ${socket.id} left customer room: ${customerId}`);
    });

    socket.on('disconnect', () => {
        console.log('👤 Client disconnected:', socket.id);
    });
});

// MongoDB connection (secured by localhost binding and firewall)
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/townranker';
mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ Connected to MongoDB (secured by network isolation)');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
});

// Calendar Event Schema
const calendarEventSchema = new mongoose.Schema({
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: String,
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date,
        required: true
    },
    eventType: {
        type: String,
        enum: ['discovery-call', 'follow-up', 'proposal-review', 'project-kickoff', 'check-in', 'final-review', 'other'],
        default: 'other'
    },
    workflowStage: {
        type: String,
        enum: ['qualified', 'proposal', 'negotiation', 'closed-won', 'closed-lost']
    },
    location: String,
    meetingLink: String,
    googleEventId: String, // Store Google Calendar event ID for syncing
    googleCalendarSynced: {
        type: Boolean,
        default: false
    },
    reminder: {
        type: Number, // Minutes before event
        default: 15
    },
    status: {
        type: String,
        enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'],
        default: 'scheduled'
    },
    notes: String,
    createdBy: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);

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
        unique: true,
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
        subject: { type: String, default: '(No Subject)' },
        body: { type: String, required: true },
        template: String,
        sentAt: { type: Date, default: Date.now },
        messageId: String,
        status: { type: String, enum: ['sent', 'draft', 'failed', 'received'], default: 'sent' },
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
    }],
    // Workflow data - using Mixed type for flexibility
    workflowItems: [mongoose.Schema.Types.Mixed],
    workflowColumns: [mongoose.Schema.Types.Mixed]
});

// Create Lead model
const Lead = mongoose.model('Lead', leadSchema);

// Email Notification Schema for recent activity
const notificationSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['email_open', 'customer_reply', 'new_lead'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    customerName: {
        type: String,
        required: true
    },
    customerEmail: {
        type: String,
        required: true
    },
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead'
    },
    metadata: {
        emailSubject: String,
        openCount: Number,
        replyContent: String
    },
    read: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create Notification model
const Notification = mongoose.model('Notification', notificationSchema);

// Helper function to create notifications
async function createNotification(type, title, message, customerName, customerEmail, leadId, metadata = {}) {
    try {
        // Create the notification
        const notification = new Notification({
            type,
            title,
            message,
            customerName,
            customerEmail,
            leadId,
            metadata
        });

        await notification.save();

        // Keep only the 5 most recent notifications
        const allNotifications = await Notification.find().sort({ createdAt: -1 });
        if (allNotifications.length > 5) {
            const toDelete = allNotifications.slice(5);
            for (const oldNotification of toDelete) {
                await Notification.findByIdAndDelete(oldNotification._id);
            }
            console.log(`🗑️ Cleaned up ${toDelete.length} old notifications`);
        }

        console.log(`📢 Notification created: ${title}`);
        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
    }
}

const { router: authRoutes, verifyToken: authenticateToken } = require('./routes/auth');

// Email transporter setup
const fs = require('fs').promises;

// IMAP configuration for receiving emails
const imapConfig = {
    user: process.env.EMAIL_USER || 'rank@townranker.com',
    password: process.env.EMAIL_PASS,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: {
        rejectUnauthorized: false
    }
};

// Email receiving system
let emailReceiver = null;
let isMonitoringEmails = false;

// Function to start monitoring emails
function startEmailMonitoring() {
    if (isMonitoringEmails || !process.env.EMAIL_PASS) {
        console.log('📧 Email monitoring already running or credentials missing');
        return;
    }

    emailReceiver = new Imap(imapConfig);
    
    emailReceiver.once('ready', () => {
        console.log('📧 IMAP connection ready - monitoring for new emails');
        isMonitoringEmails = true;
        
        // Open inbox
        emailReceiver.openBox('INBOX', false, (err, box) => {
            if (err) {
                console.error('Failed to open inbox:', err);
                return;
            }
            
            console.log('📬 Inbox opened, monitoring for new emails...');
            
            // Listen for new emails
            emailReceiver.on('mail', (numNewMsgs) => {
                console.log(`📨 ${numNewMsgs} new email(s) received`);
                fetchNewEmails();
            });
        });
    });

    emailReceiver.once('error', (err) => {
        console.error('📧 IMAP Error:', err);
        isMonitoringEmails = false;
        
        // Retry connection after 30 seconds
        setTimeout(() => {
            console.log('🔄 Retrying email connection...');
            startEmailMonitoring();
        }, 30000);
    });

    emailReceiver.once('end', () => {
        console.log('📧 IMAP connection ended');
        isMonitoringEmails = false;
    });

    emailReceiver.connect();
}

// Function to fetch and process new emails
function fetchNewEmails() {
    if (!emailReceiver) return;

    // Search for unseen emails (and recent emails for debugging)
    emailReceiver.search(['UNSEEN'], (err, results) => {
        if (err) {
            console.error('Email search error:', err);
            return;
        }

        // If no unseen emails, also check for ALL emails for debugging
        if (!results || results.length === 0) {
            console.log('📭 No unseen emails found, checking ALL emails in inbox...');
            
            emailReceiver.search(['ALL'], (err2, allResults) => {
                if (err2) {
                    console.error('All emails search error:', err2);
                    return;
                }
                
                if (allResults && allResults.length > 0) {
                    console.log(`📧 Found ${allResults.length} total emails in inbox`);
                    
                    // Fetch last 3 emails to see what we have
                    const lastEmails = allResults.slice(-3);
                    console.log(`🔍 Checking last 3 emails: ${lastEmails}`);
                    
                    const debugFetch = emailReceiver.fetch(lastEmails, {
                        bodies: 'HEADER',
                        struct: true
                    });
                    
                    debugFetch.on('message', (msg, seqno) => {
                        msg.on('body', (stream, info) => {
                            let buffer = '';
                            stream.on('data', (chunk) => {
                                buffer += chunk.toString('utf8');
                            });
                            stream.on('end', () => {
                                try {
                                    const parsed = simpleParser(buffer);
                                    parsed.then(mail => {
                                        const from = mail.from?.value?.[0]?.address?.toLowerCase();
                                        const subject = mail.subject || '';
                                        const date = mail.date || '';
                                        console.log(`📬 Email ${seqno}: From "${from}", Subject: "${subject}", Date: ${date}`);
                                    });
                                } catch (e) {
                                    console.error('Error parsing email header:', e);
                                }
                            });
                        });
                    });
                    
                    debugFetch.on('end', () => {
                        console.log('🔍 Email header check complete');
                        
                        // Also search specifically for emails from coryanalla@gmail.com
                        console.log('🔍 Searching specifically for emails from coryanalla@gmail.com...');
                        emailReceiver.search([['FROM', 'coryanalla@gmail.com']], (err3, coryResults) => {
                            if (err3) {
                                console.error('Cory email search error:', err3);
                                return;
                            }
                            
                            if (coryResults && coryResults.length > 0) {
                                console.log(`✅ Found ${coryResults.length} email(s) from coryanalla@gmail.com: ${coryResults}`);
                                
                                // Fetch the most recent one
                                const latestCory = coryResults.slice(-1);
                                const coryFetch = emailReceiver.fetch(latestCory, {
                                    bodies: '',
                                    markSeen: false // Don't mark as seen for debugging
                                });
                                
                                coryFetch.on('message', (msg, seqno) => {
                                    let emailBody = '';
                                    
                                    msg.on('body', (stream, info) => {
                                        let buffer = '';
                                        stream.on('data', (chunk) => {
                                            buffer += chunk.toString('utf8');
                                        });
                                        stream.on('end', () => {
                                            emailBody = buffer;
                                        });
                                    });
                                    
                                    msg.once('end', () => {
                                        console.log(`🎯 Found Cory's email! Processing...`);
                                        processIncomingEmail(emailBody);
                                    });
                                });
                            } else {
                                console.log('❌ No emails found from coryanalla@gmail.com');
                                console.log('💡 This means the reply either:');
                                console.log('   1. Hasn\'t reached the inbox yet');
                                console.log('   2. Went to spam/promotions folder');
                                console.log('   3. Was sent from a different email address');
                            }
                        });
                    });
                } else {
                    console.log('📭 No emails found in inbox at all');
                }
            });
            return;
        }

        console.log(`📧 Processing ${results.length} new email(s)`);

        const fetch = emailReceiver.fetch(results, {
            bodies: '',
            markSeen: true
        });

        fetch.on('message', (msg, seqno) => {
            let emailBody = '';
            
            msg.on('body', (stream, info) => {
                let buffer = '';
                stream.on('data', (chunk) => {
                    buffer += chunk.toString('utf8');
                });
                stream.once('end', () => {
                    emailBody = buffer;
                });
            });

            msg.once('attributes', (attrs) => {
                // Parse the email
                simpleParser(emailBody, async (err, parsed) => {
                    if (err) {
                        console.error('Email parsing error:', err);
                        return;
                    }

                    await processIncomingEmail(parsed, attrs);
                });
            });
        });

        fetch.once('error', (err) => {
            console.error('Email fetch error:', err);
        });

        fetch.once('end', () => {
            console.log('✅ Finished processing new emails');
        });
    });
}

// Function to process incoming emails and match to customers
async function processIncomingEmail(parsed, attrs) {
    try {
        const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase();
        const subject = parsed.subject || '';
        const textContent = parsed.text || '';
        const htmlContent = parsed.html || '';
        const receivedDate = parsed.date || new Date();

        console.log(`📨 Processing email from: ${fromEmail}`);
        console.log(`📝 Subject: ${subject}`);
        console.log(`📄 Content preview: ${textContent.substring(0, 100)}...`);
        console.log(`📅 Date: ${receivedDate}`);

        if (!fromEmail) {
            console.log('❌ No sender email found, skipping');
            return;
        }

        // Find matching customer by email
        const customer = await Lead.findOne({ 
            email: fromEmail 
        });

        if (!customer) {
            console.log(`❓ No customer found for email: ${fromEmail}`);
            console.log(`🔍 Searching for customers with email containing: ${fromEmail}`);
            
            // Try partial match in case of email variations
            const partialCustomer = await Lead.findOne({
                email: { $regex: fromEmail.split('@')[0], $options: 'i' }
            });
            
            if (partialCustomer) {
                console.log(`🎯 Found partial match: ${partialCustomer.name} (${partialCustomer.email})`);
            } else {
                console.log(`📋 Available customer emails:`);
                const allCustomers = await Lead.find({}, 'name email').limit(10);
                allCustomers.forEach(c => console.log(`   ${c.name}: ${c.email}`));
            }
            return;
        }

        console.log(`✅ Found customer: ${customer.name} (${customer._id})`);

        // Add email to customer's interaction history and email history
        await Lead.findByIdAndUpdate(customer._id, {
            $push: {
                interactions: {
                    type: 'email',
                    title: 'Email Received',
                    description: subject,
                    timestamp: receivedDate,
                    metadata: {
                        emailSubject: subject,
                        isIncoming: true,
                        textContent: textContent.substring(0, 500), // Store first 500 chars
                        fromEmail: fromEmail
                    }
                },
                emailHistory: {
                    subject: subject,
                    body: textContent,
                    sentAt: receivedDate,
                    messageId: parsed.messageId || `incoming-${Date.now()}`,
                    status: 'received',
                    direction: 'incoming',
                    type: 'received',
                    openCount: 0
                }
            },
            lastContacted: receivedDate,
            $inc: { emailCount: 1 }
        });

        // Send notification about the reply
        await sendReplyNotification(customer, subject, textContent, fromEmail);

        console.log(`💾 Email reply saved for customer: ${customer.name}`);

        // Create in-app notification for customer reply
        await createNotification(
            'customer_reply',
            `${customer.name} replied to your email`,
            `New reply: "${subject || 'No subject'}" - ${textContent.substring(0, 100)}${textContent.length > 100 ? '...' : ''}`,
            customer.name,
            customer.email,
            customer._id,
            {
                emailSubject: subject || 'No subject',
                replyContent: textContent.substring(0, 200)
            }
        );

    } catch (error) {
        console.error('Error processing incoming email:', error);
    }
}

// Function to send notification about customer reply
async function sendReplyNotification(customer, subject, content, fromEmail) {
    // Check if reply notifications are enabled
    if (global.notificationSettings?.replyNotifications === false) {
        console.log('📧 Customer reply notification disabled - skipping notification email');
        return;
    }
    
    try {
        const notificationHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">📨 Customer Reply Received!</h1>
                </div>
                <div style="padding: 30px; background: #f0f9ff; line-height: 1.6;">
                    <h2 style="color: #1e40af; margin-top: 0;">${customer.name} replied to your email!</h2>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                        <h3 style="color: #1e40af; margin-top: 0;">📋 Customer Details</h3>
                        <p><strong>Name:</strong> ${customer.name}</p>
                        <p><strong>Email:</strong> ${customer.email}</p>
                        <p><strong>Company:</strong> ${customer.company || 'Not provided'}</p>
                        <p><strong>Project:</strong> ${customer.projectType}</p>
                        <p><strong>Budget:</strong> $${(customer.budget || 0).toLocaleString()}</p>
                    </div>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
                        <h3 style="color: #065f46; margin-top: 0;">📧 Email Reply</h3>
                        <p><strong>Subject:</strong> ${subject}</p>
                        <p><strong>From:</strong> ${fromEmail}</p>
                        <p><strong>Received:</strong> ${new Date().toLocaleString()}</p>
                        <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin-top: 15px;">
                            <p style="margin: 0; font-style: italic;">${content.substring(0, 300)}${content.length > 300 ? '...' : ''}</p>
                        </div>
                    </div>
                    
                    <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #92400e; margin-top: 0;">⚡ Quick Actions</h3>
                        <p>Your customer is actively engaged! Consider:</p>
                        <ul>
                            <li>Sending a quick response</li>
                            <li>Scheduling a follow-up call</li>
                            <li>Moving them to the next stage in your pipeline</li>
                        </ul>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://townranker.com/login" 
                           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                  color: white; 
                                  padding: 15px 30px; 
                                  border-radius: 8px; 
                                  text-decoration: none; 
                                  display: inline-block; 
                                  font-weight: bold;">
                            View Customer & Reply →
                        </a>
                    </div>
                </div>
                <div style="background: #1f2937; padding: 20px; text-align: center;">
                    <p style="color: white; margin: 0; font-weight: bold;">TownRanker Email System</p>
                    <p style="color: #9ca3af; margin: 5px 0; font-size: 14px;">Never miss a customer reply</p>
                </div>
            </div>
        `;
        
        await transporter.sendMail({
            from: process.env.EMAIL_FROM || '"TownRanker Notifications" <notifications@townranker.com>',
            to: 'rank@townranker.com',
            subject: `📨 ${customer.name} replied to your email - ${customer.projectType} project`,
            html: notificationHtml
        });
        
        console.log(`📬 Reply notification sent to rank@townranker.com for ${customer.name}`);
    } catch (emailError) {
        console.error('Failed to send reply notification:', emailError);
    }
}
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

// Mount messaging routes
const openphoneRoutes = require('./routes/openphone');
const messagesRoutes = require('./routes/messages');
app.use('/api/openphone', openphoneRoutes);
app.use('/api/messages', messagesRoutes);


// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Helper function for admin authentication - supports both token types
function authenticateAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ message: 'No authorization header' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const adminToken = process.env.ADMIN_TOKEN || 'Madman155!';
    
    // Check if it's an admin-session token (from /api/admin/login)
    if (token.startsWith('admin-session-') || token === adminToken) {
        req.user = { role: 'admin', id: 'admin' };
        return next();
    }
    
    // Check if it's a JWT token (from /api/auth/login)
    const JWT_SECRET = process.env.JWT_SECRET || 'townranker-secret-key-2024';
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if user has admin role
        if (decoded.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired' });
        }
        return res.status(401).json({ message: 'Invalid token' });
    }
}

// Admin login endpoint
app.post('/api/admin/login', (req, res) => {
    try {
        const { password } = req.body;
        const adminToken = process.env.ADMIN_TOKEN || 'dev-token';
        
        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required'
            });
        }
        
        if (password === adminToken) {
            // Generate a session token for the admin
            const sessionToken = 'admin-session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            
            res.json({
                success: true,
                message: 'Login successful',
                token: sessionToken
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Invalid password'
            });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Force email check endpoint
app.get('/api/check-emails', (req, res) => {
    console.log('🔄 Manual email check requested');
    if (emailReceiver) {
        fetchNewEmails();
        res.json({ success: true, message: 'Email check triggered' });
    } else {
        res.json({ success: false, message: 'Email receiver not connected' });
    }
});

// Submit contact form
app.post('/api/contact', async (req, res) => {
    try {
        console.log('📥 Lead form submission received:', req.body);
        const leadData = req.body;
        
        // Validate required fields
        if (!leadData.name || !leadData.email || !leadData.phone) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }
        
        // Check if customer already exists with this email
        const existingLead = await Lead.findOne({ email: leadData.email.toLowerCase() });
        if (existingLead) {
            return res.status(409).json({
                success: false,
                message: 'A customer with this email already exists',
                existingCustomer: {
                    id: existingLead._id,
                    name: existingLead.name,
                    email: existingLead.email,
                    status: existingLead.status
                }
            });
        }
        
        // Create new lead
        const lead = new Lead(leadData);
        await lead.save();
        
        // Create in-app notification for new lead
        await createNotification(
            'new_lead',
            `New lead: ${lead.name}`,
            `${lead.projectType ? lead.projectType.replace('-', ' ') : 'New project'} inquiry from ${lead.company || lead.name} - $${(lead.budget || 0).toLocaleString()} budget`,
            lead.name,
            lead.email,
            lead._id,
            {
                projectType: lead.projectType,
                budget: lead.budget,
                company: lead.company
            }
        );
        
        
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
app.get('/api/leads', authenticateAdmin, async (req, res) => {
    try {
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

// Create new lead (from admin dashboard)
app.post('/api/leads', authenticateAdmin, async (req, res) => {
    try {
        console.log('📥 Admin creating new customer:', req.body);
        const leadData = req.body;
        
        // Validate required fields
        if (!leadData.name || !leadData.email || !leadData.phone) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, email, and phone'
            });
        }
        
        // Check if customer already exists with this email
        const existingLead = await Lead.findOne({ email: leadData.email.toLowerCase() });
        if (existingLead) {
            return res.status(409).json({
                success: false,
                message: 'A customer with this email already exists',
                existingCustomer: {
                    id: existingLead._id,
                    name: existingLead.name,
                    email: existingLead.email,
                    status: existingLead.status
                }
            });
        }
        
        // Set default status if not provided
        if (!leadData.status) {
            leadData.status = 'new';
        }
        
        // Create new lead
        const lead = new Lead(leadData);
        await lead.save();
        
        console.log('✅ Customer created successfully:', lead._id);
        
        res.json({
            success: true,
            message: 'Customer added successfully',
            lead
        });
    } catch (error) {
        console.error('Error creating customer:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error creating customer'
        });
    }
});

// Get dashboard stats
app.get('/api/stats', authenticateAdmin, async (req, res) => {
    try {
        const totalLeads = await Lead.countDocuments();
        const newLeads = await Lead.countDocuments({ status: 'new' });
        const qualifiedLeads = await Lead.countDocuments({ status: 'qualified' });
        const closedWon = await Lead.countDocuments({ status: 'closed-won' });
        
        // Get leads from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentLeads = await Lead.countDocuments({ 
            createdAt: { $gte: thirtyDaysAgo } 
        });
        
        res.json({
            success: true,
            stats: {
                totalLeads,
                newLeads,
                qualifiedLeads,
                closedWon,
                recentLeads,
                conversionRate: totalLeads > 0 ? ((closedWon / totalLeads) * 100).toFixed(1) : 0
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching stats',
            error: error.message
        });
    }
});

// Create new event
app.post('/api/events', authenticateAdmin, async (req, res) => {
    try {
        const {
            title,
            start,
            end,
            description,
            location,
            reminder,
            clientId,
            clientName,
            clientEmail
        } = req.body;

        // Simple event storage - you could create a proper Event model later
        const eventData = {
            title,
            start: new Date(start),
            end: new Date(end),
            description: description || '',
            location: location || '',
            reminder: parseInt(reminder) || 0,
            clientId: clientId || null,
            clientName: clientName || null,
            clientEmail: clientEmail || null,
            createdAt: new Date(),
            adminId: req.adminId // from auth middleware
        };

        // For now, we'll just log the event since we don't have Event model
        // In production, you'd save to database: await Event.create(eventData);
        console.log('📅 Event created:', eventData);

        res.json({
            success: true,
            message: 'Event created successfully',
            data: eventData
        });

    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create event'
        });
    }
});

// Get events (for future calendar display)
app.get('/api/events', authenticateAdmin, async (req, res) => {
    try {
        // For now, return empty array since we don't have Event model
        // In production: const events = await Event.find().sort({ start: 1 });
        
        res.json({
            success: true,
            events: []
        });

    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch events'
        });
    }
});

// Get Google Calendar API configuration
app.get('/api/google-calendar-config', authenticateAdmin, (req, res) => {
    try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const apiKey = process.env.GOOGLE_API_KEY;
        
        if (!clientId || !apiKey) {
            return res.status(404).json({
                success: false,
                message: 'Google Calendar API credentials not configured'
            });
        }

        res.json({
            success: true,
            clientId,
            apiKey
        });
    } catch (error) {
        console.error('Error getting Google Calendar config:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get Google Calendar configuration'
        });
    }
});

// Get users (for admin dashboard)
app.get('/api/users', authenticateAdmin, async (req, res) => {
    try {
        const User = require('./models/User');
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json({
            success: true,
            count: users.length,
            users
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error.message
        });
    }
});

// Update lead status
app.patch('/api/leads/:id', authenticateAdmin, async (req, res) => {
    try {
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

// Get notification settings
app.get('/api/settings/notifications', authenticateAdmin, (req, res) => {
    try {
        // For now, return default settings - in production you might store these in database
        res.json({
            success: true,
            settings: {
                emailNotifications: true,
                replyNotifications: true,
                autoRefresh: false
            }
        });
    } catch (error) {
        console.error('Error fetching notification settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching settings'
        });
    }
});

// Set notification settings
app.post('/api/settings/notifications', authenticateAdmin, (req, res) => {
    try {
        const { emailNotifications, replyNotifications, autoRefresh } = req.body;
        
        // Store in memory (in production, you'd store in database)
        global.notificationSettings = {
            emailNotifications: emailNotifications !== false,
            replyNotifications: replyNotifications !== false,
            autoRefresh: autoRefresh === true
        };

        console.log('📱 Notification settings updated:', global.notificationSettings);

        res.json({
            success: true,
            message: 'Settings updated successfully',
            settings: global.notificationSettings
        });
    } catch (error) {
        console.error('Error updating notification settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating settings'
        });
    }
});

// Get recent notifications (limit to 5)
app.get('/api/notifications', authenticateAdmin, async (req, res) => {
    try {
        const notifications = await Notification.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('leadId', 'name email projectType');

        res.json({
            success: true,
            data: notifications
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching notifications'
        });
    }
});

// Delete notification
app.delete('/api/notifications/:id', authenticateAdmin, async (req, res) => {
    try {

        const { id } = req.params;
        const notification = await Notification.findByIdAndDelete(id);

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        console.log(`🗑️ Notification deleted: ${notification.title}`);

        res.json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting notification'
        });
    }
});

// Mark notification as read
app.patch('/api/notifications/:id/read', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findByIdAndUpdate(
            id,
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            data: notification
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating notification'
        });
    }
});

// Test endpoint to create a sample notification (for testing only)
app.post('/api/test-notification', authenticateAdmin, async (req, res) => {
    try {
        // Create test notification
        await createNotification(
            'email_open',
            'Test Email Opened',
            'This is a test notification to verify the system is working',
            'Test Customer',
            'test@example.com',
            null,
            { emailSubject: 'Test Email', openCount: 1 }
        );

        res.json({
            success: true,
            message: 'Test notification created successfully'
        });
    } catch (error) {
        console.error('Error creating test notification:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating test notification'
        });
    }
});

// Delete customer
app.delete('/api/leads/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const lead = await Lead.findByIdAndDelete(id);
        
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        
        console.log(`🗑️ Customer deleted: ${lead.name} (${lead.email})`);
        
        res.json({
            success: true,
            message: `Customer ${lead.name} has been deleted successfully`,
            deletedCustomer: {
                id: lead._id,
                name: lead.name,
                email: lead.email
            }
        });
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting customer'
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

// Cache to prevent duplicate notifications
const recentEmailOpens = new Map();

// Email open tracking endpoint
app.get('/api/track-email-open/:trackingId', async (req, res) => {
    try {
        const { trackingId } = req.params;
        
        // Log the email open
        console.log(`📧 Email opened: ${trackingId} at ${new Date().toISOString()}`);
        
        // Check if this email was opened recently (within 30 seconds)
        const now = Date.now();
        const recentOpenKey = trackingId;
        const lastOpenTime = recentEmailOpens.get(recentOpenKey);
        
        if (lastOpenTime && (now - lastOpenTime) < 30000) {
            // Skip notification if opened within last 30 seconds
            console.log(`⏭️ Skipping duplicate notification for ${trackingId} (opened ${Math.round((now - lastOpenTime)/1000)}s ago)`);
            // Still serve the tracking pixel
            const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
            res.set({
                'Content-Type': 'image/png',
                'Content-Length': pixel.length,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            return res.send(pixel);
        }
        
        // Update the cache with current time
        recentEmailOpens.set(recentOpenKey, now);
        
        // Clean up old entries (older than 1 minute)
        for (const [key, time] of recentEmailOpens.entries()) {
            if (now - time > 60000) {
                recentEmailOpens.delete(key);
            }
        }
        
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
            let mostRecentEmail = null;
            if (updatedLead.emailHistory && updatedLead.emailHistory.length > 0) {
                mostRecentEmail = updatedLead.emailHistory[updatedLead.emailHistory.length - 1];
                mostRecentEmail.openCount = (mostRecentEmail.openCount || 0) + 1;
                mostRecentEmail.lastOpened = new Date();
                await updatedLead.save();
            }
            
            console.log(`✅ Email open tracked for lead: ${lead.name}`);
            
            // Create in-app notification
            await createNotification(
                'email_open',
                `${lead.name} opened your email`,
                `Customer opened "${mostRecentEmail?.subject || 'your email'}" - ${mostRecentEmail?.openCount || 1} time${(mostRecentEmail?.openCount || 1) !== 1 ? 's' : ''}`,
                lead.name,
                lead.email,
                lead._id,
                {
                    emailSubject: mostRecentEmail?.subject || 'No subject',
                    openCount: mostRecentEmail?.openCount || 1
                }
            );
            
            // Send notification email about the email open (if enabled)
            if (global.notificationSettings?.emailNotifications !== false) {
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
                                <a href="https://townranker.com/login" 
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
            } else {
                console.log('📧 Email open notification disabled - skipping notification email');
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
        console.log(`📧 Email history requested for lead ID: ${id}`);
        
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
        
        console.log(`📧 Returning ${emailHistory.length} emails for lead ${lead.name}`);
        
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

// Workflow API endpoints

// Get workflow data for a lead
app.get('/api/leads/:id/workflow', authenticateAdmin, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }

        res.json({
            success: true,
            data: {
                workflowItems: lead.workflowItems || [],
                workflowColumns: lead.workflowColumns || []
            }
        });
    } catch (error) {
        console.error('Error fetching workflow data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching workflow data'
        });
    }
});

// Update workflow data for a lead
app.put('/api/leads/:id/workflow', authenticateAdmin, async (req, res) => {
    try {
        console.log('🔄 PUT /api/leads/' + req.params.id + '/workflow - Received workflow save request');
        console.log('📋 Items received:', req.body.workflowItems?.length || 0);
        console.log('📊 Columns received:', req.body.workflowColumns?.length || 0);
        
        const { workflowItems, workflowColumns } = req.body;
        
        const lead = await Lead.findByIdAndUpdate(
            req.params.id,
            { 
                workflowItems: workflowItems || [],
                workflowColumns: workflowColumns || [],
                updatedAt: Date.now() 
            },
            { new: true }
        );

        if (!lead) {
            console.log('❌ Lead not found for ID:', req.params.id);
            return res.status(404).json({
                success: false,
                message: 'Lead not found'
            });
        }

        console.log('✅ Workflow data saved successfully for:', lead.name);
        console.log('✅ Saved items:', lead.workflowItems?.length || 0);

        res.json({
            success: true,
            data: {
                workflowItems: lead.workflowItems,
                workflowColumns: lead.workflowColumns
            }
        });
    } catch (error) {
        console.error('Error updating workflow data:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating workflow data'
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

// Calendar Events API Endpoints

// Get all calendar events
app.get('/api/calendar/events', authenticateAdmin, async (req, res) => {
    try {
        const { start, end, leadId } = req.query;
        let query = {};
        
        if (leadId) {
            query.leadId = leadId;
        }
        
        if (start && end) {
            query.startTime = {
                $gte: new Date(start),
                $lte: new Date(end)
            };
        }
        
        const events = await CalendarEvent.find(query)
            .populate('leadId', 'name email phone company')
            .sort({ startTime: 1 });
        
        res.json({
            success: true,
            events
        });
    } catch (error) {
        console.error('Error fetching calendar events:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching calendar events'
        });
    }
});

// Create a calendar event
app.post('/api/calendar/events', authenticateAdmin, async (req, res) => {
    try {
        const eventData = req.body;
        
        // Validate required fields
        if (!eventData.leadId || !eventData.title || !eventData.startTime || !eventData.endTime) {
            return res.status(400).json({
                success: false,
                message: 'Lead ID, title, start time, and end time are required'
            });
        }
        
        // Create the event
        const event = new CalendarEvent(eventData);
        await event.save();
        
        // Populate lead data
        await event.populate('leadId', 'name email phone company');
        
        // If Google Calendar sync is requested, create Google event
        if (eventData.syncToGoogle) {
            // This will be handled by the frontend using the Google Calendar API
            event.googleCalendarSynced = true;
        }
        
        res.json({
            success: true,
            event
        });
    } catch (error) {
        console.error('Error creating calendar event:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating calendar event'
        });
    }
});

// Get a single calendar event
app.get('/api/calendar/events/:eventId', authenticateAdmin, async (req, res) => {
    try {
        const { eventId } = req.params;
        
        const event = await CalendarEvent.findById(eventId)
            .populate('leadId', 'name email phone company');
        
        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }
        
        res.json({
            success: true,
            event
        });
    } catch (error) {
        console.error('Error fetching calendar event:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching calendar event'
        });
    }
});

// Update a calendar event
app.put('/api/calendar/events/:eventId', authenticateAdmin, async (req, res) => {
    try {
        const { eventId } = req.params;
        const updates = req.body;
        
        updates.updatedAt = new Date();
        
        const event = await CalendarEvent.findByIdAndUpdate(
            eventId,
            updates,
            { new: true }
        ).populate('leadId', 'name email phone company');
        
        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }
        
        res.json({
            success: true,
            event
        });
    } catch (error) {
        console.error('Error updating calendar event:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating calendar event'
        });
    }
});

// Delete a calendar event
app.delete('/api/calendar/events/:eventId', authenticateAdmin, async (req, res) => {
    try {
        const { eventId } = req.params;
        
        const event = await CalendarEvent.findByIdAndDelete(eventId);
        
        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Event deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting calendar event:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting calendar event'
        });
    }
});

// Get events for a specific lead
app.get('/api/leads/:id/events', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const events = await CalendarEvent.find({ leadId: id })
            .sort({ startTime: 1 });
        
        res.json({
            success: true,
            events
        });
    } catch (error) {
        console.error('Error fetching lead events:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching lead events'
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
server.listen(PORT, () => {
    console.log(`🚀 TownRanker server running on port ${PORT}`);
    console.log(`📍 Visit http://localhost:${PORT} to view the website`);
    console.log(`💬 Socket.io enabled for real-time messaging`);
    
    // Start email monitoring
    setTimeout(() => {
        console.log('🚀 Starting email monitoring...');
        startEmailMonitoring();
    }, 5000); // Wait 5 seconds for server to fully start

    // Start OpenPhone message sync
    setTimeout(() => {
        console.log('📱 Starting OpenPhone message sync...');
        openphoneSync.setSocketIO(io);
        openphoneSync.startPeriodicSync(2); // Sync every 2 minutes
    }, 7000); // Wait 7 seconds to start after email monitoring
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    
    // Close email connection
    if (emailReceiver) {
        console.log('📧 Closing email connection...');
        emailReceiver.end();
    }

    // Stop OpenPhone sync
    console.log('📱 Stopping OpenPhone sync...');
    openphoneSync.stopPeriodicSync();
    
    await mongoose.connection.close();
    process.exit(0);
});