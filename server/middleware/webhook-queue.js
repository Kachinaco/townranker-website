/**
 * Webhook Queue System
 *
 * Handles webhook failures by:
 * 1. Queuing failed webhooks to database
 * 2. Retrying on a schedule
 * 3. Logging all webhook activity
 * 4. Alerting admin of persistent failures
 */

const fs = require('fs').promises;
const path = require('path');

class WebhookQueue {
    constructor() {
        this.queueFile = path.join(__dirname, '../../webhook-queue.json');
        this.retryInterval = 2 * 60 * 1000; // 2 minutes
        this.maxRetries = 100; // Keep trying for ~3+ hours
        this.isProcessing = false;

        this.init();
    }

    async init() {
        // Ensure queue file exists
        try {
            await fs.access(this.queueFile);
        } catch {
            await this.saveQueue([]);
        }

        // Start processing queue
        this.startProcessor();

        console.log('✅ Webhook queue system initialized');
    }

    /**
     * Add webhook to queue
     */
    async enqueue(webhookData) {
        const queueItem = {
            id: `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            data: webhookData,
            timestamp: new Date().toISOString(),
            retries: 0,
            lastRetry: null,
            status: 'pending',
            source: webhookData.source || 'unknown',
            type: webhookData.type || 'unknown'
        };

        const queue = await this.getQueue();
        queue.push(queueItem);
        await this.saveQueue(queue);

        console.log(`📥 Queued webhook: ${queueItem.id} (${queueItem.type})`);

        return queueItem.id;
    }

    /**
     * Process webhook queue
     */
    startProcessor() {
        setInterval(async () => {
            if (this.isProcessing) return;

            try {
                this.isProcessing = true;
                await this.processQueue();
            } catch (error) {
                console.error('❌ Queue processing error:', error);
            } finally {
                this.isProcessing = false;
            }
        }, this.retryInterval);

        // Also process on startup after 10 seconds
        setTimeout(() => this.processQueue(), 10000);
    }

    /**
     * Process pending webhooks
     */
    async processQueue() {
        const queue = await this.getQueue();
        const pending = queue.filter(item =>
            item.status === 'pending' && item.retries < this.maxRetries
        );

        if (pending.length === 0) return;

        console.log(`🔄 Processing webhook queue: ${pending.length} pending items`);

        for (const item of pending) {
            try {
                // Call the appropriate webhook handler
                await this.processWebhook(item);

                // Mark as completed
                item.status = 'completed';
                item.completedAt = new Date().toISOString();

                console.log(`✅ Webhook processed successfully: ${item.id}`);

            } catch (error) {
                // Increment retry count
                item.retries++;
                item.lastRetry = new Date().toISOString();
                item.lastError = error.message;

                console.warn(`⚠️  Webhook retry failed: ${item.id} (attempt ${item.retries}/${this.maxRetries})`);

                // Mark as failed if max retries reached
                if (item.retries >= this.maxRetries) {
                    item.status = 'failed';
                    item.failedAt = new Date().toISOString();

                    // Alert admin
                    await this.alertAdmin(item);

                    console.error(`❌ Webhook permanently failed: ${item.id}`);
                }
            }
        }

        // Save updated queue
        await this.saveQueue(queue);

        // Cleanup old completed/failed items (>7 days)
        await this.cleanup();
    }

    /**
     * Process individual webhook based on source
     */
    async processWebhook(item) {
        const { data, source, type } = item;

        switch (source) {
            case 'openphone':
                return await this.processOpenPhoneWebhook(data);

            case 'contact-form':
                return await this.processContactFormWebhook(data);

            default:
                throw new Error(`Unknown webhook source: ${source}`);
        }
    }

    /**
     * Process OpenPhone webhook
     */
    async processOpenPhoneWebhook(data) {
        // Import the OpenPhone webhook handler
        const openphoneHandler = require('../routes/openphone');

        // Process the webhook
        return await openphoneHandler.processWebhookData(data);
    }

    /**
     * Process contact form webhook
     */
    async processContactFormWebhook(data) {
        // Import contact handler
        const contactHandler = require('../routes/contact');

        // Process the form submission
        return await contactHandler.processContactSubmission(data);
    }

    /**
     * File operations
     */
    async getQueue() {
        try {
            const data = await fs.readFile(this.queueFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.warn('Queue file read error, returning empty queue:', error.message);
            return [];
        }
    }

    async saveQueue(queue) {
        try {
            await fs.writeFile(this.queueFile, JSON.stringify(queue, null, 2), 'utf8');
        } catch (error) {
            console.error('❌ Failed to save queue:', error);
        }
    }

    /**
     * Cleanup old entries
     */
    async cleanup() {
        const queue = await this.getQueue();
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

        const cleaned = queue.filter(item => {
            const itemTime = new Date(item.timestamp).getTime();
            const keepItem = itemTime > sevenDaysAgo || item.status === 'pending';

            if (!keepItem) {
                console.log(`🗑️  Removing old webhook: ${item.id}`);
            }

            return keepItem;
        });

        if (cleaned.length < queue.length) {
            await this.saveQueue(cleaned);
            console.log(`🧹 Cleaned ${queue.length - cleaned.length} old webhook entries`);
        }
    }

    /**
     * Alert admin of permanent failure
     */
    async alertAdmin(item) {
        try {
            // Try to send Slack notification
            const slackWebhook = process.env.SLACK_WEBHOOK_URL;

            if (slackWebhook) {
                await fetch(slackWebhook, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: `🚨 Webhook Permanently Failed`,
                        blocks: [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `*Webhook ID:* ${item.id}\n*Source:* ${item.source}\n*Type:* ${item.type}\n*Retries:* ${item.retries}\n*Last Error:* ${item.lastError}`
                                }
                            }
                        ]
                    })
                });
            }
        } catch (error) {
            console.error('Failed to send admin alert:', error);
        }
    }

    /**
     * Admin methods
     */
    async getStats() {
        const queue = await this.getQueue();

        return {
            total: queue.length,
            pending: queue.filter(i => i.status === 'pending').length,
            completed: queue.filter(i => i.status === 'completed').length,
            failed: queue.filter(i => i.status === 'failed').length,
            queue: queue
        };
    }

    async retryAll() {
        const queue = await this.getQueue();

        queue.forEach(item => {
            if (item.status === 'failed' || item.status === 'pending') {
                item.status = 'pending';
                item.retries = 0;
                item.lastError = null;
            }
        });

        await this.saveQueue(queue);
        console.log('🔄 Reset all webhooks for retry');

        // Process immediately
        setTimeout(() => this.processQueue(), 1000);
    }

    async exportQueue() {
        return await this.getQueue();
    }
}

// Create singleton instance
const webhookQueue = new WebhookQueue();

module.exports = webhookQueue;
