#!/usr/bin/env node
/**
 * Initialize SMS Templates Script
 * This script sets up the default SMS templates for the TownRanker application
 */

require('dotenv').config();
const mongoose = require('mongoose');
const smsTemplateService = require('../services/smsTemplateService');

// Connect to MongoDB
async function connectDB() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/townranker';
        
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        console.log('✅ Connected to MongoDB successfully');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        return false;
    }
}

// Initialize SMS templates
async function initializeTemplates() {
    try {
        console.log('🚀 Starting SMS Template initialization...\n');
        
        const result = await smsTemplateService.initializeDefaultTemplates();
        
        if (result.success) {
            console.log('\n🎉 SMS Templates initialized successfully!');
            
            // Get and display template stats
            const templateStats = await smsTemplateService.getTemplates({}, { limit: 100 });
            
            if (templateStats.success) {
                console.log(`\n📊 Template Statistics:`);
                console.log(`   • Total templates: ${templateStats.pagination.total}`);
                
                const categories = {};
                templateStats.templates.forEach(template => {
                    categories[template.category] = (categories[template.category] || 0) + 1;
                });
                
                Object.entries(categories).forEach(([category, count]) => {
                    console.log(`   • ${category}: ${count} templates`);
                });
            }
            
            // Test template generation
            console.log('\n🧪 Testing template generation...');
            
            const testLead = {
                customerName: 'John Smith',
                firstName: 'John',
                projectType: 'business website',
                status: 'new',
                budget: 5000,
                timeline: '2-3 months'
            };
            
            const welcomeTest = await smsTemplateService.generateSMSByCategory('welcome', testLead);
            
            if (welcomeTest.success) {
                console.log('✅ Welcome template test passed');
                console.log(`   Content: ${welcomeTest.content.substring(0, 100)}...`);
                console.log(`   Segments: ${welcomeTest.segmentCount}`);
                console.log(`   Within limit: ${welcomeTest.withinLimit}`);
            } else {
                console.log('❌ Welcome template test failed:', welcomeTest.error);
            }
            
        } else {
            console.log('❌ Failed to initialize templates:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Error during initialization:', error.message);
    }
}

// Main function
async function main() {
    console.log('📱 TownRanker SMS Template Initializer\n');
    
    // Connect to database
    const connected = await connectDB();
    if (!connected) {
        process.exit(1);
    }
    
    // Initialize templates
    await initializeTemplates();
    
    // Close database connection
    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
    console.log('🏁 Initialization complete!');
    
    process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Script failed:', error.message);
        process.exit(1);
    });
}

module.exports = { initializeTemplates, connectDB };