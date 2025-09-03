#!/usr/bin/env node
/**
 * SMS Template System Test Script
 * This script comprehensively tests all SMS template functionality
 */

require('dotenv').config();
const mongoose = require('mongoose');
const smsTemplateService = require('../services/smsTemplateService');
const SMSTemplate = require('../models/SMSTemplate');

// Test data
const testLeads = [
    {
        customerName: 'John Smith',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
        phone: '5551234567',
        projectType: 'business',
        status: 'new',
        budget: 5000,
        timeline: '2-3months',
        source: 'website',
        company: 'ABC Corp'
    },
    {
        customerName: 'Sarah Johnson',
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: 'sarah@tech.com',
        phone: '5559876543',
        projectType: 'ecommerce',
        status: 'qualified',
        budget: 15000,
        timeline: 'asap',
        source: 'referral',
        company: 'Tech Solutions'
    },
    {
        customerName: 'Mike Davis',
        firstName: 'Mike',
        lastName: 'Davis',
        email: 'mike@startup.com',
        phone: '5555555555',
        projectType: 'webapp',
        status: 'proposal',
        budget: 50000,
        timeline: '6months+',
        source: 'advertising',
        company: 'Startup Inc'
    }
];

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

// Test template creation
async function testTemplateCreation() {
    console.log('\n🧪 Testing Template Creation...');
    
    const timestamp = Date.now();
    const testTemplate = {
        name: `Test Custom Template ${timestamp}`,
        category: 'custom',
        description: 'A test template for validation',
        content: 'Hi {{firstName}}, this is a test message for {{projectType}} project. Budget: {{budget}}. Contact: {{companyPhone}}',
        conditions: {
            leadStatus: ['new', 'contacted'],
            budgetRange: { min: 1000, max: 10000 }
        },
        maxLength: 160,
        allowSplitting: true,
        priority: 3,
        tags: ['test', 'custom']
    };
    
    const result = await smsTemplateService.createTemplate(testTemplate);
    
    if (result.success) {
        console.log('✅ Template creation test passed');
        console.log(`   Template ID: ${result.template._id}`);
        return result.template._id;
    } else {
        console.log('❌ Template creation test failed:', result.error);
        return null;
    }
}

// Test template generation for different scenarios
async function testTemplateGeneration() {
    console.log('\n🧪 Testing Template Generation...');
    
    const categories = ['welcome', 'follow-up', 'proposal', 'thank-you', 'lead-nurture'];
    let passedTests = 0;
    let totalTests = 0;
    
    for (const category of categories) {
        console.log(`\n   Testing category: ${category}`);
        
        for (const [index, lead] of testLeads.entries()) {
            totalTests++;
            
            try {
                const result = await smsTemplateService.generateSMSByCategory(category, lead);
                
                if (result.success) {
                    console.log(`   ✅ Lead ${index + 1} (${lead.firstName}): Generated successfully`);
                    console.log(`      Content: ${result.content.substring(0, 80)}...`);
                    console.log(`      Segments: ${result.segmentCount}, Length: ${result.totalLength}`);
                    
                    // Verify personalization
                    if (result.content.includes(lead.firstName)) {
                        console.log(`      ✅ Personalization working (found ${lead.firstName})`);
                    } else {
                        console.log(`      ⚠️  Personalization may not be working`);
                    }
                    
                    passedTests++;
                } else {
                    console.log(`   ❌ Lead ${index + 1}: Generation failed - ${result.error}`);
                }
            } catch (error) {
                console.log(`   ❌ Lead ${index + 1}: Exception - ${error.message}`);
            }
        }
    }
    
    console.log(`\n📊 Generation Test Results: ${passedTests}/${totalTests} passed`);
    return passedTests === totalTests;
}

// Test template selection logic
async function testTemplateSelection() {
    console.log('\n🧪 Testing Template Selection Logic...');
    
    let passedTests = 0;
    let totalTests = 0;
    
    for (const lead of testLeads) {
        totalTests++;
        
        try {
            const template = await smsTemplateService.findBestTemplate('follow-up', lead);
            
            if (template) {
                console.log(`✅ ${lead.firstName}: Found template "${template.name}"`);
                console.log(`   Conditions match: ${template.matchesConditions(lead)}`);
                console.log(`   Priority: ${template.priority}, Success rate: ${template.successRate}%`);
                passedTests++;
            } else {
                console.log(`❌ ${lead.firstName}: No suitable template found`);
            }
        } catch (error) {
            console.log(`❌ ${lead.firstName}: Selection error - ${error.message}`);
        }
    }
    
    console.log(`\n📊 Selection Test Results: ${passedTests}/${totalTests} passed`);
    return passedTests === totalTests;
}

// Test character limits and message splitting
async function testMessageSplitting() {
    console.log('\n🧪 Testing Message Splitting...');
    
    // Create a template with long content
    const timestamp = Date.now();
    const longTemplate = {
        name: `Long Test Template ${timestamp}`,
        category: 'custom',
        content: 'Hi {{firstName}}, this is a very long message designed to test the SMS splitting functionality. ' +
                'It contains multiple sentences and should exceed the standard SMS character limit of 160 characters. ' +
                'This will help us verify that the message splitting works correctly and maintains message coherence. ' +
                'Your project type is {{projectType}} and budget is {{budget}}. We are excited to work with you!',
        maxLength: 160,
        allowSplitting: true,
        splitMarker: ' (cont.)'
    };
    
    const createResult = await smsTemplateService.createTemplate(longTemplate);
    
    if (!createResult.success) {
        console.log('❌ Could not create long template for testing');
        return false;
    }
    
    const testResult = await smsTemplateService.generateSMSFromTemplate(
        createResult.template._id,
        testLeads[0]
    );
    
    if (testResult.success) {
        console.log('✅ Message splitting test passed');
        console.log(`   Original length: ${testResult.totalLength}`);
        console.log(`   Segments: ${testResult.segmentCount}`);
        console.log(`   Within limit: ${testResult.withinLimit}`);
        
        testResult.segments.forEach((segment, index) => {
            console.log(`   Segment ${index + 1}: ${segment.substring(0, 50)}... (${segment.length} chars)`);
        });
        
        // Clean up test template
        await smsTemplateService.deleteTemplate(createResult.template._id);
        
        return true;
    } else {
        console.log('❌ Message splitting test failed:', testResult.error);
        return false;
    }
}

// Test template conditions
async function testTemplateConditions() {
    console.log('\n🧪 Testing Template Conditions...');
    
    // Test template with specific conditions
    const timestamp = Date.now();
    const conditionalTemplate = {
        name: `High Budget Template ${timestamp}`,
        category: 'custom',
        content: 'Hi {{firstName}}, we have special services for high-budget {{projectType}} projects like yours ({{budget}})!',
        conditions: {
            budgetRange: { min: 10000, max: 100000 },
            leadStatus: ['qualified', 'proposal']
        },
        priority: 8
    };
    
    const createResult = await smsTemplateService.createTemplate(conditionalTemplate);
    
    if (!createResult.success) {
        console.log('❌ Could not create conditional template for testing');
        return false;
    }
    
    const template = createResult.template;
    let passedTests = 0;
    let totalTests = testLeads.length;
    
    testLeads.forEach(lead => {
        const matches = template.matchesConditions(lead);
        const shouldMatch = (lead.budget >= 10000 && lead.budget <= 100000) && 
                          ['qualified', 'proposal'].includes(lead.status);
        
        if (matches === shouldMatch) {
            console.log(`✅ ${lead.firstName}: Condition matching correct (${matches})`);
            passedTests++;
        } else {
            console.log(`❌ ${lead.firstName}: Condition matching incorrect (got ${matches}, expected ${shouldMatch})`);
        }
    });
    
    // Clean up test template
    await smsTemplateService.deleteTemplate(createResult.template._id);
    
    console.log(`\n📊 Condition Test Results: ${passedTests}/${totalTests} passed`);
    return passedTests === totalTests;
}

// Test template usage statistics
async function testUsageStatistics() {
    console.log('\n🧪 Testing Usage Statistics...');
    
    try {
        const templates = await SMSTemplate.find({ isActive: true }).limit(3);
        
        if (templates.length === 0) {
            console.log('❌ No templates found for statistics testing');
            return false;
        }
        
        const template = templates[0];
        const originalUsage = template.usageCount;
        const originalSuccessRate = template.successRate;
        
        // Test successful usage increment
        await template.incrementUsage(true);
        
        // Fetch updated template
        const updatedTemplate = await SMSTemplate.findById(template._id);
        
        if (updatedTemplate.usageCount === originalUsage + 1) {
            console.log('✅ Usage count increment test passed');
        } else {
            console.log('❌ Usage count increment test failed');
            return false;
        }
        
        if (updatedTemplate.successRate >= originalSuccessRate) {
            console.log('✅ Success rate update test passed');
        } else {
            console.log('❌ Success rate update test failed');
        }
        
        // Test statistics retrieval
        const statsResult = await smsTemplateService.getTemplateStats(template._id);
        
        if (statsResult.success) {
            console.log('✅ Statistics retrieval test passed');
            console.log(`   Usage count: ${statsResult.stats.usageCount}`);
            console.log(`   Success rate: ${statsResult.stats.successRate}%`);
        } else {
            console.log('❌ Statistics retrieval test failed');
            return false;
        }
        
        return true;
    } catch (error) {
        console.log('❌ Usage statistics test error:', error.message);
        return false;
    }
}

// Test template preview functionality
async function testTemplatePreview() {
    console.log('\n🧪 Testing Template Preview...');
    
    try {
        const templates = await SMSTemplate.find({ isActive: true }).limit(1);
        
        if (templates.length === 0) {
            console.log('❌ No templates found for preview testing');
            return false;
        }
        
        const previewResult = await smsTemplateService.previewTemplate(
            templates[0]._id,
            testLeads[0]
        );
        
        if (previewResult.success) {
            console.log('✅ Template preview test passed');
            console.log(`   Template: ${previewResult.template.name}`);
            console.log(`   Preview: ${previewResult.preview.content.substring(0, 100)}...`);
            console.log(`   Segments: ${previewResult.preview.segmentCount}`);
            return true;
        } else {
            console.log('❌ Template preview test failed:', previewResult.error);
            return false;
        }
    } catch (error) {
        console.log('❌ Template preview test error:', error.message);
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('🧪 SMS Template System - Comprehensive Test Suite\n');
    
    const testResults = [];
    
    // Test 1: Template Creation
    const customTemplateId = await testTemplateCreation();
    testResults.push(customTemplateId !== null);
    
    // Test 2: Template Generation
    testResults.push(await testTemplateGeneration());
    
    // Test 3: Template Selection
    testResults.push(await testTemplateSelection());
    
    // Test 4: Message Splitting
    testResults.push(await testMessageSplitting());
    
    // Test 5: Template Conditions
    testResults.push(await testTemplateConditions());
    
    // Test 6: Usage Statistics
    testResults.push(await testUsageStatistics());
    
    // Test 7: Template Preview
    testResults.push(await testTemplatePreview());
    
    // Clean up custom template if created
    if (customTemplateId) {
        await smsTemplateService.deleteTemplate(customTemplateId);
        console.log('\n🧹 Cleaned up test template');
    }
    
    // Summary
    const passedTests = testResults.filter(Boolean).length;
    const totalTests = testResults.length;
    
    console.log(`\n📊 Test Summary:`);
    console.log(`   Total tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests}`);
    console.log(`   Failed: ${totalTests - passedTests}`);
    console.log(`   Success rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    
    if (passedTests === totalTests) {
        console.log('\n🎉 All tests passed! SMS Template system is working correctly.');
    } else {
        console.log('\n⚠️  Some tests failed. Please review the output above.');
    }
    
    return passedTests === totalTests;
}

// Main function
async function main() {
    // Connect to database
    const connected = await connectDB();
    if (!connected) {
        process.exit(1);
    }
    
    // Run all tests
    const allTestsPassed = await runAllTests();
    
    // Close database connection
    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
    
    // Exit with appropriate code
    process.exit(allTestsPassed ? 0 : 1);
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
        console.error('❌ Test script failed:', error.message);
        process.exit(1);
    });
}

module.exports = { runAllTests, connectDB };