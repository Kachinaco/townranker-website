const mongoose = require('mongoose');
const EmailTemplate = require('./models/EmailTemplate');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/townranker', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const templates = [
    {
        name: 'Welcome Email',
        category: 'welcome',
        description: 'Send to new leads after form submission',
        subject: 'Welcome to TownRanker, {{firstName}}!',
        bodyHtml: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">Welcome to TownRanker!</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                    <h2 style="color: #1f2937;">Hi {{firstName}},</h2>
                    <p style="color: #4b5563; line-height: 1.6;">
                        Thank you for your interest in TownRanker! We're excited to help you build your digital presence.
                    </p>
                    <p style="color: #4b5563; line-height: 1.6;">
                        We've received your inquiry about a {{projectType}} project with a budget of {{budget}}. 
                        Our team will review your requirements and get back to you within 2 hours as promised.
                    </p>
                    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #6366f1;">What happens next?</h3>
                        <ul style="color: #4b5563;">
                            <li>We'll analyze your requirements</li>
                            <li>Prepare a customized proposal</li>
                            <li>Schedule a call to discuss your project</li>
                        </ul>
                    </div>
                    <p style="color: #4b5563;">
                        Best regards,<br>
                        The TownRanker Team
                    </p>
                </div>
            </div>
        `,
        availableTags: [
            { tag: '{{firstName}}', description: 'Customer first name' },
            { tag: '{{projectType}}', description: 'Type of project' },
            { tag: '{{budget}}', description: 'Project budget' }
        ]
    },
    {
        name: 'Follow-up Email',
        category: 'follow-up',
        description: 'Check in with leads after initial contact',
        subject: 'Quick follow-up on your {{projectType}} project',
        bodyHtml: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="padding: 30px; background: #f9fafb;">
                    <h2 style="color: #1f2937;">Hi {{firstName}},</h2>
                    <p style="color: #4b5563; line-height: 1.6;">
                        I wanted to follow up on your {{projectType}} project inquiry. Have you had a chance to review our proposal?
                    </p>
                    <p style="color: #4b5563; line-height: 1.6;">
                        I'd love to discuss how we can help bring your vision to life. Are you available for a quick call this week?
                    </p>
                    <div style="background: #e0e7ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p style="color: #4338ca; margin: 0;">
                            <strong>Quick Reminder:</strong> We're offering a special discount this month for new projects!
                        </p>
                    </div>
                    <p style="color: #4b5563;">
                        Looking forward to hearing from you!<br><br>
                        Best regards,<br>
                        TownRanker Team
                    </p>
                </div>
            </div>
        `,
        availableTags: [
            { tag: '{{firstName}}', description: 'Customer first name' },
            { tag: '{{projectType}}', description: 'Type of project' }
        ]
    },
    {
        name: 'Invoice Reminder',
        category: 'invoice',
        description: 'Remind customers about pending payments',
        subject: 'Payment Reminder - Invoice #{{invoiceNumber}}',
        bodyHtml: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="padding: 30px; background: #f9fafb;">
                    <h2 style="color: #1f2937;">Hi {{firstName}},</h2>
                    <p style="color: #4b5563; line-height: 1.6;">
                        This is a friendly reminder that your invoice is due soon.
                    </p>
                    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #6366f1;">Invoice Details:</h3>
                        <p style="color: #4b5563;">
                            <strong>Invoice Number:</strong> {{invoiceNumber}}<br>
                            <strong>Amount Due:</strong> {{amountDue}}<br>
                            <strong>Due Date:</strong> {{dueDate}}
                        </p>
                    </div>
                    <p style="color: #4b5563;">
                        Please let us know if you have any questions about this invoice.
                    </p>
                    <p style="color: #4b5563;">
                        Thank you!<br>
                        TownRanker Billing Team
                    </p>
                </div>
            </div>
        `,
        availableTags: [
            { tag: '{{firstName}}', description: 'Customer first name' },
            { tag: '{{invoiceNumber}}', description: 'Invoice number' },
            { tag: '{{amountDue}}', description: 'Amount due' },
            { tag: '{{dueDate}}', description: 'Payment due date' }
        ]
    },
    {
        name: 'Project Update',
        category: 'project',
        description: 'Update customers on project progress',
        subject: 'Project Update: {{projectName}}',
        bodyHtml: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">Project Update</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                    <h2 style="color: #1f2937;">Hi {{firstName}},</h2>
                    <p style="color: #4b5563; line-height: 1.6;">
                        Great news! We've made significant progress on your project.
                    </p>
                    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #10b981;">Progress Update:</h3>
                        <div style="background: #e5e7eb; border-radius: 8px; height: 20px; margin: 10px 0;">
                            <div style="background: #10b981; height: 20px; border-radius: 8px; width: {{progress}}%;"></div>
                        </div>
                        <p style="color: #4b5563;">Project is {{progress}}% complete</p>
                    </div>
                    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #6366f1;">Recent Accomplishments:</h3>
                        <ul style="color: #4b5563;">
                            <li>Completed design phase</li>
                            <li>Implemented core functionality</li>
                            <li>Set up testing environment</li>
                        </ul>
                    </div>
                    <p style="color: #4b5563;">
                        We're on track to complete your project by the scheduled date. 
                        Feel free to reach out if you have any questions!
                    </p>
                    <p style="color: #4b5563;">
                        Best regards,<br>
                        Your Project Team
                    </p>
                </div>
            </div>
        `,
        availableTags: [
            { tag: '{{firstName}}', description: 'Customer first name' },
            { tag: '{{projectName}}', description: 'Project name' },
            { tag: '{{progress}}', description: 'Project progress percentage' }
        ]
    },
    {
        name: 'Thank You Email',
        category: 'marketing',
        description: 'Thank customers after project completion',
        subject: 'Thank You for Choosing TownRanker!',
        bodyHtml: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">Thank You! 🎉</h1>
                </div>
                <div style="padding: 30px; background: #f9fafb;">
                    <h2 style="color: #1f2937;">Hi {{firstName}},</h2>
                    <p style="color: #4b5563; line-height: 1.6;">
                        We wanted to take a moment to thank you for choosing TownRanker for your {{projectType}} project.
                    </p>
                    <p style="color: #4b5563; line-height: 1.6;">
                        It's been a pleasure working with you, and we're thrilled with how your project turned out!
                    </p>
                    <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #92400e;">🌟 Leave us a review!</h3>
                        <p style="color: #78350f;">
                            Your feedback helps us improve and helps other businesses find us. 
                            Would you mind sharing your experience?
                        </p>
                    </div>
                    <p style="color: #4b5563;">
                        Remember, we're always here if you need any updates or have new projects in mind!
                    </p>
                    <p style="color: #4b5563;">
                        Warm regards,<br>
                        The TownRanker Team
                    </p>
                </div>
            </div>
        `,
        availableTags: [
            { tag: '{{firstName}}', description: 'Customer first name' },
            { tag: '{{projectType}}', description: 'Type of project completed' }
        ]
    }
];

async function setupTemplates() {
    try {
        console.log('Setting up email templates...');
        
        for (const template of templates) {
            const existing = await EmailTemplate.findOne({ name: template.name });
            if (!existing) {
                await EmailTemplate.create(template);
                console.log(`✅ Created template: ${template.name}`);
            } else {
                console.log(`⏭️  Template already exists: ${template.name}`);
            }
        }
        
        console.log('✅ Email templates setup complete!');
        process.exit(0);
    } catch (error) {
        console.error('Error setting up templates:', error);
        process.exit(1);
    }
}

setupTemplates();