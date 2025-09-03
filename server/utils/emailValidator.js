/**
 * Email Configuration Validator
 * Validates Gmail authentication, DNS records, and security settings
 */

const dns = require('dns').promises;
const nodemailer = require('nodemailer');

class EmailValidator {
    constructor() {
        this.domain = 'townranker.com';
        this.results = {
            authentication: {},
            dns: {},
            security: {},
            overall: 'pending'
        };
    }

    /**
     * Validate Gmail authentication configuration
     */
    async validateAuthentication() {
        console.log('🔍 Validating email authentication...');
        
        try {
            // Check environment variables
            const requiredVars = ['EMAIL_SERVICE', 'EMAIL_USER', 'EMAIL_PASS'];
            const missing = requiredVars.filter(varName => !process.env[varName]);
            
            if (missing.length > 0) {
                this.results.authentication.status = 'error';
                this.results.authentication.message = `Missing environment variables: ${missing.join(', ')}`;
                return false;
            }

            // Test transporter creation
            const transporter = nodemailer.createTransporter({
                service: process.env.EMAIL_SERVICE,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            // Test connection
            const verified = await new Promise((resolve, reject) => {
                transporter.verify((error, success) => {
                    if (error) reject(error);
                    else resolve(success);
                });
            });

            this.results.authentication = {
                status: 'success',
                message: 'Gmail authentication verified successfully',
                service: process.env.EMAIL_SERVICE,
                user: process.env.EMAIL_USER,
                verified: true,
                appPasswordUsed: process.env.EMAIL_PASS && process.env.EMAIL_PASS.includes(' '), // App passwords have spaces
                recommendations: []
            };

            // Add recommendations
            if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
                this.results.authentication.recommendations.push(
                    'Consider implementing OAuth2 for enhanced security'
                );
            }

            return true;

        } catch (error) {
            this.results.authentication = {
                status: 'error',
                message: `Authentication failed: ${error.message}`,
                error: error.code || error.message,
                recommendations: [
                    'Verify Gmail app-specific password is correct',
                    'Ensure 2-factor authentication is enabled on Gmail account',
                    'Check that "Less secure app access" is disabled (using app password instead)'
                ]
            };
            return false;
        }
    }

    /**
     * Validate DNS records (SPF, DKIM, DMARC)
     */
    async validateDNSRecords() {
        console.log('🔍 Validating DNS records...');
        
        const dnsResults = {
            spf: await this.checkSPFRecord(),
            dkim: await this.checkDKIMRecord(),
            dmarc: await this.checkDMARCRecord()
        };

        // Calculate overall DNS status
        const hasErrors = Object.values(dnsResults).some(result => result.status === 'error');
        const hasWarnings = Object.values(dnsResults).some(result => result.status === 'warning');

        this.results.dns = {
            status: hasErrors ? 'error' : (hasWarnings ? 'warning' : 'success'),
            records: dnsResults,
            recommendations: []
        };

        // Add recommendations based on results
        if (dnsResults.dmarc.status === 'error') {
            this.results.dns.recommendations.push('Set up DMARC record for enhanced email security');
        }
        if (dnsResults.spf.status === 'warning') {
            this.results.dns.recommendations.push('Review SPF record configuration for optimal delivery');
        }

        return this.results.dns.status !== 'error';
    }

    /**
     * Check SPF record
     */
    async checkSPFRecord() {
        try {
            const records = await dns.resolveTxt(this.domain);
            const spfRecord = records.find(record => 
                Array.isArray(record) ? record.join('').startsWith('v=spf1') : record.startsWith('v=spf1')
            );

            if (!spfRecord) {
                return {
                    status: 'error',
                    message: 'No SPF record found',
                    record: null
                };
            }

            const spfText = Array.isArray(spfRecord) ? spfRecord.join('') : spfRecord;
            
            // Check for Google inclusion
            const hasGoogleSPF = spfText.includes('include:_spf.google.com');
            
            return {
                status: hasGoogleSPF ? 'success' : 'warning',
                message: hasGoogleSPF ? 'SPF record correctly configured for Google' : 'SPF record found but may need Google configuration',
                record: spfText,
                hasGoogleInclude: hasGoogleSPF
            };

        } catch (error) {
            return {
                status: 'error',
                message: `Failed to check SPF record: ${error.message}`,
                record: null
            };
        }
    }

    /**
     * Check DKIM record for Google
     */
    async checkDKIMRecord() {
        try {
            const dkimDomain = `google._domainkey.${this.domain}`;
            const records = await dns.resolveTxt(dkimDomain);
            
            const dkimRecord = records.find(record => 
                Array.isArray(record) ? record.join('').includes('v=DKIM1') : record.includes('v=DKIM1')
            );

            if (!dkimRecord) {
                return {
                    status: 'warning',
                    message: 'No Google DKIM record found',
                    record: null
                };
            }

            const dkimText = Array.isArray(dkimRecord) ? dkimRecord.join('') : dkimRecord;

            return {
                status: 'success',
                message: 'Google DKIM record found and configured',
                record: dkimText.substring(0, 100) + '...', // Truncate for display
                selector: 'google'
            };

        } catch (error) {
            return {
                status: 'warning',
                message: `Google DKIM record not found: ${error.message}`,
                record: null
            };
        }
    }

    /**
     * Check DMARC record
     */
    async checkDMARCRecord() {
        try {
            const dmarcDomain = `_dmarc.${this.domain}`;
            const records = await dns.resolveTxt(dmarcDomain);
            
            const dmarcRecord = records.find(record => 
                Array.isArray(record) ? record.join('').startsWith('v=DMARC1') : record.startsWith('v=DMARC1')
            );

            if (!dmarcRecord) {
                return {
                    status: 'error',
                    message: 'No DMARC record found',
                    record: null,
                    recommendation: 'Add DMARC record: v=DMARC1; p=quarantine; rua=mailto:dmarc@townranker.com'
                };
            }

            const dmarcText = Array.isArray(dmarcRecord) ? dmarcRecord.join('') : dmarcRecord;

            // Parse DMARC policy
            const policyMatch = dmarcText.match(/p=([^;]+)/);
            const policy = policyMatch ? policyMatch[1] : 'none';

            return {
                status: 'success',
                message: `DMARC record found with policy: ${policy}`,
                record: dmarcText,
                policy: policy
            };

        } catch (error) {
            return {
                status: 'error',
                message: 'DMARC record not found',
                record: null,
                recommendation: 'Add DMARC record for email authentication and reporting'
            };
        }
    }

    /**
     * Validate sender verification settings
     */
    async validateSenderVerification() {
        console.log('🔍 Validating sender verification...');

        const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
        const emailUser = process.env.EMAIL_USER;

        const results = {
            status: 'success',
            fromEmail: fromEmail,
            emailUser: emailUser,
            issues: [],
            recommendations: []
        };

        // Check if FROM email matches authenticated user
        if (fromEmail && emailUser) {
            const fromAddress = fromEmail.match(/<(.+?)>/) ? fromEmail.match(/<(.+?)>/)[1] : fromEmail;
            
            if (fromAddress !== emailUser) {
                results.issues.push(`FROM address (${fromAddress}) differs from authenticated user (${emailUser})`);
                results.recommendations.push('Ensure FROM address matches Gmail account or use proper domain delegation');
            }
        }

        // Check domain alignment
        const userDomain = emailUser ? emailUser.split('@')[1] : '';
        if (userDomain && userDomain !== this.domain) {
            if (userDomain === 'gmail.com') {
                results.recommendations.push('Using Gmail address - ensure proper SPF/DKIM setup for domain alignment');
            } else {
                results.issues.push(`Email user domain (${userDomain}) doesn't match website domain (${this.domain})`);
            }
        }

        results.status = results.issues.length > 0 ? 'warning' : 'success';
        this.results.security = results;

        return results.status !== 'error';
    }

    /**
     * Test email sending capability
     */
    async testEmailSending(testEmail = null) {
        console.log('🔍 Testing email sending capability...');

        try {
            const transporter = nodemailer.createTransporter({
                service: process.env.EMAIL_SERVICE,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            const testRecipient = testEmail || process.env.EMAIL_USER;
            
            const testMessage = {
                from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                to: testRecipient,
                subject: '🧪 TownRanker Email Test - Configuration Validation',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #6366f1;">✅ Email Configuration Test</h2>
                        <p>This is a test email to verify that your TownRanker email configuration is working correctly.</p>
                        
                        <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #0ea5e9;">Configuration Details:</h3>
                            <ul>
                                <li><strong>Service:</strong> ${process.env.EMAIL_SERVICE}</li>
                                <li><strong>From:</strong> ${process.env.EMAIL_FROM || process.env.EMAIL_USER}</li>
                                <li><strong>Authentication:</strong> App Password</li>
                                <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
                            </ul>
                        </div>
                        
                        <p style="color: #065f46;">
                            <strong>✅ If you receive this email, your configuration is working correctly!</strong>
                        </p>
                        
                        <p style="color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                            This test was sent by the TownRanker Email Validator.<br>
                            Generated: ${new Date().toLocaleString()}
                        </p>
                    </div>
                `
            };

            const result = await transporter.sendMail(testMessage);

            return {
                status: 'success',
                message: 'Test email sent successfully',
                messageId: result.messageId,
                recipient: testRecipient
            };

        } catch (error) {
            return {
                status: 'error',
                message: `Test email failed: ${error.message}`,
                error: error.code || error.message
            };
        }
    }

    /**
     * Run comprehensive validation
     */
    async runFullValidation(options = {}) {
        console.log('🚀 Starting comprehensive email validation...');
        
        const startTime = Date.now();
        
        try {
            // Run all validations
            const authValid = await this.validateAuthentication();
            const dnsValid = await this.validateDNSRecords();
            const senderValid = await this.validateSenderVerification();
            
            // Test email sending if requested
            let emailTest = null;
            if (options.testEmail !== false) {
                emailTest = await this.testEmailSending(options.testEmail);
            }

            // Calculate overall status
            const allValid = authValid && dnsValid && senderValid;
            const hasWarnings = this.results.authentication.status === 'warning' ||
                              this.results.dns.status === 'warning' ||
                              this.results.security.status === 'warning';

            this.results.overall = allValid ? (hasWarnings ? 'warning' : 'success') : 'error';
            
            // Compile recommendations
            const allRecommendations = [
                ...(this.results.authentication.recommendations || []),
                ...(this.results.dns.recommendations || []),
                ...(this.results.security.recommendations || [])
            ];

            const finalResults = {
                status: this.results.overall,
                timestamp: new Date().toISOString(),
                duration: Date.now() - startTime,
                authentication: this.results.authentication,
                dns: this.results.dns,
                security: this.results.security,
                emailTest: emailTest,
                recommendations: allRecommendations,
                summary: this.generateSummary()
            };

            console.log(`✅ Email validation completed in ${finalResults.duration}ms`);
            return finalResults;

        } catch (error) {
            console.error('❌ Email validation failed:', error);
            return {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString(),
                duration: Date.now() - startTime
            };
        }
    }

    /**
     * Generate validation summary
     */
    generateSummary() {
        const summary = {
            authentication: this.results.authentication.status || 'pending',
            dns: this.results.dns.status || 'pending',
            security: this.results.security.status || 'pending',
            overallScore: 0,
            criticalIssues: 0,
            warnings: 0,
            recommendations: 0
        };

        // Calculate score and issues
        Object.values(this.results).forEach(result => {
            if (typeof result === 'object' && result.status) {
                switch (result.status) {
                    case 'success':
                        summary.overallScore += 25;
                        break;
                    case 'warning':
                        summary.overallScore += 15;
                        summary.warnings++;
                        break;
                    case 'error':
                        summary.criticalIssues++;
                        break;
                }

                if (result.recommendations) {
                    summary.recommendations += result.recommendations.length;
                }
            }
        });

        return summary;
    }
}

module.exports = EmailValidator;