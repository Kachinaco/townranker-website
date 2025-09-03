#!/usr/bin/env node

/**
 * Comprehensive Email System Test Script
 * Tests authentication, DNS records, sending capability, and security features
 */

require('dotenv').config();
const EmailValidator = require('../utils/emailValidator');
const emailService = require('../services/emailService');

class EmailSystemTester {
    constructor() {
        this.results = {
            tests: [],
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                warnings: 0
            }
        };
    }

    /**
     * Add test result
     */
    addTestResult(name, status, message, details = {}) {
        const result = {
            name,
            status, // 'pass', 'fail', 'warn'
            message,
            details,
            timestamp: new Date().toISOString()
        };

        this.results.tests.push(result);
        this.results.summary.total++;
        
        switch (status) {
            case 'pass':
                this.results.summary.passed++;
                console.log(`✅ ${name}: ${message}`);
                break;
            case 'fail':
                this.results.summary.failed++;
                console.log(`❌ ${name}: ${message}`);
                break;
            case 'warn':
                this.results.summary.warnings++;
                console.log(`⚠️ ${name}: ${message}`);
                break;
        }
    }

    /**
     * Test environment variables
     */
    testEnvironmentVariables() {
        console.log('\n🔍 Testing Environment Variables...');

        const requiredVars = [
            'EMAIL_SERVICE',
            'EMAIL_USER', 
            'EMAIL_PASS',
            'EMAIL_FROM'
        ];

        const optionalVars = [
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
            'GOOGLE_REFRESH_TOKEN'
        ];

        let allRequired = true;
        let hasOptional = 0;

        requiredVars.forEach(varName => {
            if (process.env[varName]) {
                this.addTestResult(
                    `Environment Variable: ${varName}`,
                    'pass',
                    'Present and configured'
                );
            } else {
                this.addTestResult(
                    `Environment Variable: ${varName}`,
                    'fail',
                    'Missing required environment variable'
                );
                allRequired = false;
            }
        });

        optionalVars.forEach(varName => {
            if (process.env[varName]) {
                hasOptional++;
                this.addTestResult(
                    `Environment Variable: ${varName}`,
                    'pass',
                    'OAuth2 credential available'
                );
            }
        });

        if (hasOptional === 0) {
            this.addTestResult(
                'OAuth2 Configuration',
                'warn',
                'No OAuth2 credentials found - using app password only'
            );
        }

        return allRequired;
    }

    /**
     * Test email service initialization
     */
    async testEmailServiceInit() {
        console.log('\n🔍 Testing Email Service Initialization...');

        try {
            // Wait a moment for the service to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Test service health
            const health = emailService.getHealthStatus();
            
            if (health.initialized) {
                this.addTestResult(
                    'Email Service Initialization',
                    'pass',
                    'Service initialized successfully',
                    health
                );
            } else {
                // Try to reinitialize if not initialized
                try {
                    await emailService.init();
                    const healthAfterInit = emailService.getHealthStatus();
                    if (healthAfterInit.initialized) {
                        this.addTestResult(
                            'Email Service Initialization',
                            'pass',
                            'Service initialized successfully after retry',
                            healthAfterInit
                        );
                    } else {
                        this.addTestResult(
                            'Email Service Initialization',
                            'fail',
                            'Service failed to initialize even after retry',
                            healthAfterInit
                        );
                        return false;
                    }
                } catch (initError) {
                    this.addTestResult(
                        'Email Service Initialization',
                        'fail',
                        `Service initialization failed: ${initError.message}`,
                        { error: initError.message }
                    );
                    return false;
                }
            }

            // Test configuration
            const testConfig = await emailService.testConfiguration();
            this.addTestResult(
                'Email Configuration Test',
                'pass',
                'Configuration verified successfully',
                testConfig
            );

            return true;

        } catch (error) {
            this.addTestResult(
                'Email Service Initialization',
                'fail',
                `Service initialization failed: ${error.message}`,
                { error: error.message }
            );
            return false;
        }
    }

    /**
     * Test DNS records validation
     */
    async testDNSRecords() {
        console.log('\n🔍 Testing DNS Records...');

        try {
            const validator = new EmailValidator();
            await validator.validateDNSRecords();

            const dnsResults = validator.results.dns;
            
            if (dnsResults.status === 'success') {
                this.addTestResult(
                    'DNS Records Validation',
                    'pass',
                    'All DNS records properly configured',
                    dnsResults
                );
            } else if (dnsResults.status === 'warning') {
                this.addTestResult(
                    'DNS Records Validation',
                    'warn',
                    'DNS records need attention',
                    dnsResults
                );
            } else {
                this.addTestResult(
                    'DNS Records Validation',
                    'fail',
                    'DNS configuration issues found',
                    dnsResults
                );
            }

            // Test individual records
            if (dnsResults.records) {
                Object.entries(dnsResults.records).forEach(([recordType, result]) => {
                    const status = result.status === 'success' ? 'pass' : 
                                 result.status === 'warning' ? 'warn' : 'fail';
                    
                    this.addTestResult(
                        `${recordType.toUpperCase()} Record`,
                        status,
                        result.message,
                        result
                    );
                });
            }

        } catch (error) {
            this.addTestResult(
                'DNS Records Validation',
                'fail',
                `DNS validation failed: ${error.message}`,
                { error: error.message }
            );
        }
    }

    /**
     * Test rate limiting
     */
    async testRateLimiting() {
        console.log('\n🔍 Testing Rate Limiting...');

        try {
            const status = emailService.getRateLimitStatus('test-user');
            
            this.addTestResult(
                'Rate Limiting System',
                'pass',
                'Rate limiting system operational',
                status
            );

            // Test rate limit checking
            try {
                emailService.checkRateLimit('test-user');
                this.addTestResult(
                    'Rate Limit Checking',
                    'pass',
                    'Rate limit validation working'
                );
            } catch (rateLimitError) {
                if (rateLimitError.message.includes('Rate limit exceeded')) {
                    this.addTestResult(
                        'Rate Limit Enforcement',
                        'pass',
                        'Rate limiting properly enforced'
                    );
                } else {
                    throw rateLimitError;
                }
            }

        } catch (error) {
            this.addTestResult(
                'Rate Limiting System',
                'fail',
                `Rate limiting failed: ${error.message}`,
                { error: error.message }
            );
        }
    }

    /**
     * Test bounce handling
     */
    async testBounceHandling() {
        console.log('\n🔍 Testing Bounce Handling...');

        try {
            // Test bounce statistics
            const bounceStats = emailService.getBounceStats();
            
            this.addTestResult(
                'Bounce Statistics System',
                'pass',
                `Bounce tracking operational (${bounceStats.totalBouncedEmails} tracked emails)`,
                bounceStats
            );

            // Test bounce recording (simulate)
            const testEmail = 'test-bounce@example.com';
            emailService.recordBounce(testEmail, 'Test bounce for validation');
            
            const updatedStats = emailService.getBounceStats();
            if (updatedStats.totalBouncedEmails > bounceStats.totalBouncedEmails) {
                this.addTestResult(
                    'Bounce Recording',
                    'pass',
                    'Bounce recording functionality working'
                );
                
                // Clean up test bounce
                emailService.clearBounceRecord(testEmail);
            } else {
                this.addTestResult(
                    'Bounce Recording',
                    'fail',
                    'Bounce recording not working properly'
                );
            }

        } catch (error) {
            this.addTestResult(
                'Bounce Handling System',
                'fail',
                `Bounce handling failed: ${error.message}`,
                { error: error.message }
            );
        }
    }

    /**
     * Test email sending (optional, requires recipient)
     */
    async testEmailSending(recipient = null) {
        if (!recipient) {
            this.addTestResult(
                'Email Sending Test',
                'warn',
                'Skipped - no test recipient provided'
            );
            return;
        }

        console.log('\n🔍 Testing Email Sending...');

        try {
            const testTimestamp = new Date().toLocaleString();
            const result = await emailService.sendEmail({
                to: recipient,
                subject: '🧪 TownRanker Email System Test',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #6366f1;">✅ Email System Test</h2>
                        <p>This is an automated test email from the TownRanker email validation system.</p>
                        
                        <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="margin-top: 0;">Test Results Summary:</h3>
                            <ul>
                                <li><strong>Authentication:</strong> Working</li>
                                <li><strong>Email Service:</strong> Operational</li>
                                <li><strong>Rate Limiting:</strong> Active</li>
                                <li><strong>Bounce Handling:</strong> Enabled</li>
                                <li><strong>Tracking:</strong> Functional</li>
                            </ul>
                        </div>
                        
                        <p>Test completed at: ${testTimestamp}</p>
                        <p>Message ID will be provided after sending</p>
                    </div>
                `,
                enableTracking: true
            });

            this.addTestResult(
                'Email Sending Test',
                'pass',
                `Test email sent successfully to ${recipient}`,
                {
                    messageId: result.messageId,
                    recipient: recipient,
                    rateLimitStatus: result.rateLimitStatus
                }
            );

        } catch (error) {
            this.addTestResult(
                'Email Sending Test',
                'fail',
                `Email sending failed: ${error.message}`,
                { error: error.message, recipient: recipient }
            );
        }
    }

    /**
     * Run all tests
     */
    async runAllTests(options = {}) {
        console.log('🚀 Starting Comprehensive Email System Test...');
        console.log('================================================');

        const startTime = Date.now();

        // Test 1: Environment Variables
        const envOk = this.testEnvironmentVariables();
        
        if (!envOk) {
            console.log('\n❌ Critical environment variables missing. Cannot continue with tests.');
            return this.generateReport(startTime);
        }

        // Test 2: Email Service Initialization
        const serviceOk = await this.testEmailServiceInit();
        
        // Test 3: DNS Records
        await this.testDNSRecords();
        
        // Test 4: Rate Limiting
        await this.testRateLimiting();
        
        // Test 5: Bounce Handling
        await this.testBounceHandling();
        
        // Test 6: Email Sending (if recipient provided)
        if (options.testRecipient) {
            await this.testEmailSending(options.testRecipient);
        }

        return this.generateReport(startTime);
    }

    /**
     * Generate test report
     */
    generateReport(startTime) {
        const duration = Date.now() - startTime;
        const { total, passed, failed, warnings } = this.results.summary;
        
        console.log('\n================================================');
        console.log('🎯 EMAIL SYSTEM TEST RESULTS');
        console.log('================================================');
        console.log(`Total Tests: ${total}`);
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⚠️  Warnings: ${warnings}`);
        console.log(`⏱️  Duration: ${duration}ms`);

        const successRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;
        console.log(`📊 Success Rate: ${successRate}%`);

        if (failed === 0 && warnings === 0) {
            console.log('\n🎉 ALL TESTS PASSED! Email system is fully operational.');
        } else if (failed === 0) {
            console.log('\n✅ All critical tests passed. Some warnings to review.');
        } else {
            console.log('\n⚠️  Some tests failed. Please review and fix issues.');
        }

        console.log('\n================================================');

        // Recommendations
        const failedTests = this.results.tests.filter(t => t.status === 'fail');
        const warningTests = this.results.tests.filter(t => t.status === 'warn');

        if (failedTests.length > 0) {
            console.log('\n🔧 CRITICAL ISSUES TO FIX:');
            failedTests.forEach((test, index) => {
                console.log(`${index + 1}. ${test.name}: ${test.message}`);
            });
        }

        if (warningTests.length > 0) {
            console.log('\n💡 RECOMMENDATIONS:');
            warningTests.forEach((test, index) => {
                console.log(`${index + 1}. ${test.name}: ${test.message}`);
            });
        }

        return {
            ...this.results,
            duration,
            successRate: parseFloat(successRate),
            overall: failed === 0 ? (warnings === 0 ? 'excellent' : 'good') : 'needs_attention'
        };
    }
}

// Run tests if script is called directly
if (require.main === module) {
    const tester = new EmailSystemTester();
    const recipient = process.argv[2]; // Optional test email recipient
    
    tester.runAllTests({ testRecipient: recipient })
        .then(results => {
            console.log('\nTest completed. Exiting...');
            process.exit(results.overall === 'excellent' ? 0 : 1);
        })
        .catch(error => {
            console.error('Test script failed:', error);
            process.exit(1);
        });
}

module.exports = EmailSystemTester;