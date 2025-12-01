/**
 * Reddit Lead Monitor Service
 * Monitors Arizona subreddits for window/door replacement leads using RSS feeds
 * No authentication required - uses public Reddit RSS endpoints
 */

const RedditLead = require('../models/RedditLead');
const RedditMonitorConfig = require('../models/RedditMonitorConfig');

class RedditMonitorService {
    constructor() {
        this.io = null;
        this.intervals = new Map();
        this.initialized = false;
        this.userAgent = 'TownRanker/1.0 (Lead Monitor)';
    }

    /**
     * Initialize the RSS-based monitor (no credentials needed!)
     */
    init() {
        this.initialized = true;
        console.log('✅ Reddit Monitor Service initialized (RSS mode - no auth required)');
        return true;
    }

    /**
     * Set Socket.io instance for real-time updates
     */
    setSocketIO(io) {
        this.io = io;
    }

    /**
     * Parse Atom XML from Reddit RSS feed
     */
    parseAtomFeed(xml) {
        const entries = [];

        // Match all <entry> blocks
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;

        while ((match = entryRegex.exec(xml)) !== null) {
            const entry = match[1];

            // Extract fields using regex
            const id = this.extractTag(entry, 'id') || '';
            const title = this.decodeHtml(this.extractTag(entry, 'title') || '');
            const content = this.decodeHtml(this.extractTag(entry, 'content') || '');
            const link = this.extractAttr(entry, 'link', 'href') || '';
            const published = this.extractTag(entry, 'published') || '';
            const authorName = this.extractTag(entry, 'name') || '';

            // Extract post ID from the id field (format: t3_xxxxx)
            const postIdMatch = id.match(/t3_(\w+)/);
            const postId = postIdMatch ? postIdMatch[1] : id;

            // Clean the content - remove HTML and extract text
            const cleanContent = this.stripHtml(content);

            entries.push({
                id: postId,
                title,
                selftext: cleanContent,
                permalink: link.replace('https://www.reddit.com', ''),
                author: { name: authorName },
                created_utc: published ? new Date(published).getTime() / 1000 : null
            });
        }

        return entries;
    }

    /**
     * Extract content between XML tags
     */
    extractTag(xml, tag) {
        const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const match = xml.match(regex);
        return match ? match[1].trim() : null;
    }

    /**
     * Extract attribute from a tag
     */
    extractAttr(xml, tag, attr) {
        const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
        const match = xml.match(regex);
        return match ? match[1] : null;
    }

    /**
     * Decode HTML entities
     */
    decodeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ');
    }

    /**
     * Strip HTML tags from content
     */
    stripHtml(html) {
        if (!html) return '';
        return html
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 2000);
    }

    /**
     * Score a post based on keyword matches
     */
    scorePost(title, body, config) {
        const text = `${title} ${body || ''}`.toLowerCase();
        let score = 0;
        const matches = {
            service: [],
            intent: [],
            location: []
        };

        // Check exclusions first
        for (const excl of (config.exclusionKeywords || [])) {
            if (text.includes(excl.toLowerCase())) {
                return { score: 0, excluded: true, reason: excl, matches };
            }
        }

        // High intent phrases (30 pts each)
        for (const phrase of (config.highIntentPhrases || [])) {
            if (text.includes(phrase.toLowerCase())) {
                score += config.scoring?.highIntentWeight || 30;
                matches.intent.push(phrase);
            }
        }

        // Service keywords (15 pts each)
        for (const kw of (config.serviceKeywords || [])) {
            if (text.includes(kw.toLowerCase())) {
                score += config.scoring?.serviceWeight || 15;
                matches.service.push(kw);
            }
        }

        // Location keywords (10 pts each)
        for (const loc of (config.locationKeywords || [])) {
            if (text.includes(loc.toLowerCase())) {
                score += config.scoring?.locationWeight || 10;
                matches.location.push(loc);
            }
        }

        // Determine priority
        const thresholds = config.scoring?.thresholds || { high: 60, medium: 40 };
        const priority = score >= thresholds.high ? 'high'
            : score >= thresholds.medium ? 'medium' : 'low';

        return { score, priority, matches, excluded: false };
    }

    /**
     * Fetch RSS feed for a subreddit
     */
    async fetchSubredditRSS(subreddit, searchTerms) {
        // Build search query for RSS
        const query = encodeURIComponent(searchTerms.join(' OR '));
        const url = `https://www.reddit.com/r/${subreddit}/search.rss?q=${query}&sort=new&restrict_sr=on&limit=25`;

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/rss+xml, application/atom+xml, application/xml'
                }
            });

            if (!response.ok) {
                if (response.status === 403) {
                    console.log(`   ⏭️  r/${subreddit}: Private or restricted`);
                } else if (response.status === 404) {
                    console.log(`   ⏭️  r/${subreddit}: Not found`);
                } else {
                    console.log(`   ⚠️  r/${subreddit}: HTTP ${response.status}`);
                }
                return [];
            }

            const xml = await response.text();

            // Check if we got HTML instead of XML (Reddit sometimes does this)
            if (xml.includes('<!DOCTYPE html>') || xml.includes('<html')) {
                console.log(`   ⏭️  r/${subreddit}: Got HTML instead of RSS`);
                return [];
            }

            return this.parseAtomFeed(xml);
        } catch (err) {
            console.error(`   ❌ r/${subreddit}: ${err.message}`);
            return [];
        }
    }

    /**
     * Fetch new posts from a subreddit (without search, just new posts)
     */
    async fetchNewPosts(subreddit) {
        const url = `https://www.reddit.com/r/${subreddit}/new/.rss?limit=25`;

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/rss+xml, application/atom+xml, application/xml'
                }
            });

            if (!response.ok) {
                return [];
            }

            const xml = await response.text();

            if (xml.includes('<!DOCTYPE html>') || xml.includes('<html')) {
                return [];
            }

            return this.parseAtomFeed(xml);
        } catch (err) {
            return [];
        }
    }

    /**
     * Send Slack notification for new lead
     */
    async sendSlackAlert(lead, config) {
        const webhookUrl = config.slackWebhookUrl || process.env.SLACK_WEBHOOK_LEADS;

        if (!webhookUrl) {
            return false;
        }

        const priorityEmoji = lead.priority === 'high' ? '🔥' : lead.priority === 'medium' ? '📍' : '📝';

        const payload = {
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: `${priorityEmoji} Reddit Lead: r/${lead.subreddit}`,
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*${lead.title}*\n\n${(lead.selftext || '').substring(0, 300)}${lead.selftext?.length > 300 ? '...' : ''}`
                    }
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*Score:* ${lead.score}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Priority:* ${lead.priority}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Subreddit:* r/${lead.subreddit}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Author:* u/${lead.author || 'unknown'}`
                        }
                    ]
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: `Service: ${lead.serviceMatches?.join(', ') || 'None'} | Intent: ${lead.intentMatches?.join(', ') || 'None'}`
                        }
                    ]
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'View on Reddit',
                                emoji: true
                            },
                            url: lead.redditUrl,
                            action_id: 'view_reddit'
                        }
                    ]
                }
            ]
        };

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error('Slack notification failed:', response.statusText);
                return false;
            }

            return true;
        } catch (err) {
            console.error('Slack notification error:', err.message);
            return false;
        }
    }

    /**
     * Emit Socket.io event for real-time updates
     */
    emitNewLead(lead) {
        if (this.io) {
            this.io.emit('reddit_lead', {
                type: 'new',
                lead: lead.toObject()
            });
        }
    }

    /**
     * Run a single monitor cycle
     */
    async runMonitor(configId) {
        if (!this.initialized) {
            console.log('⚠️  Reddit Monitor not initialized. Skipping run.');
            return null;
        }

        const config = await RedditMonitorConfig.findOne({ monitorId: configId });
        if (!config) {
            console.error(`Monitor config not found: ${configId}`);
            return null;
        }

        if (!config.isActive) {
            console.log(`Monitor ${configId} is disabled. Skipping.`);
            return null;
        }

        const stats = {
            postsChecked: 0,
            leadsFound: 0,
            subredditsSearched: 0,
            errors: 0
        };

        console.log(`\n🔍 Reddit Monitor [${configId}]: Scanning ${config.targetSubreddits?.length || 0} subreddits via RSS...`);

        const searchTerms = config.searchTerms?.length > 0
            ? config.searchTerms
            : ['window', 'door', 'glass', 'windows', 'doors'];

        for (const sub of (config.targetSubreddits || [])) {
            try {
                stats.subredditsSearched++;

                // Try search RSS first, fallback to new posts
                let posts = await this.fetchSubredditRSS(sub, searchTerms);

                // If search returns nothing, also check new posts
                if (posts.length === 0) {
                    const newPosts = await this.fetchNewPosts(sub);
                    // Filter new posts by search terms
                    posts = newPosts.filter(post => {
                        const text = `${post.title} ${post.selftext || ''}`.toLowerCase();
                        return searchTerms.some(term => text.includes(term.toLowerCase()));
                    });
                }

                for (const post of posts) {
                    stats.postsChecked++;

                    // Check if already processed
                    const exists = await RedditLead.findOne({ redditPostId: post.id });
                    if (exists) continue;

                    // Only capture recent posts (within last 48 hours)
                    // This prevents grabbing old historical posts
                    if (post.created_utc) {
                        const postAge = Date.now() - (post.created_utc * 1000);
                        const maxAge = 48 * 60 * 60 * 1000; // 48 hours in ms
                        if (postAge > maxAge) {
                            continue; // Skip old posts
                        }
                    }

                    // Score the post
                    const scoring = this.scorePost(post.title, post.selftext, config);

                    // Skip if excluded or below threshold
                    if (scoring.excluded) {
                        continue;
                    }

                    const minScore = config.scoring?.minScore || 30;
                    if (scoring.score < minScore) {
                        continue;
                    }

                    // Create new RedditLead
                    const lead = new RedditLead({
                        redditPostId: post.id,
                        redditUrl: `https://reddit.com${post.permalink}`,
                        subreddit: sub,
                        author: post.author?.name || '[deleted]',
                        title: post.title,
                        selftext: post.selftext?.substring(0, 2000),
                        score: scoring.score,
                        priority: scoring.priority,
                        serviceMatches: scoring.matches.service,
                        intentMatches: scoring.matches.intent,
                        locationMatches: scoring.matches.location,
                        monitorId: configId,
                        monitorName: config.name,
                        postCreatedAt: post.created_utc ? new Date(post.created_utc * 1000) : null
                    });

                    await lead.save();
                    stats.leadsFound++;

                    console.log(`   ✅ Lead (score ${scoring.score}): r/${sub} - ${post.title.substring(0, 50)}...`);

                    // Send Slack notification for medium/high priority
                    if (config.slackEnabled && scoring.priority !== 'low') {
                        const sent = await this.sendSlackAlert(lead, config);
                        if (sent) {
                            lead.slackSent = true;
                            lead.slackSentAt = new Date();
                            await lead.save();
                        }
                    }

                    // Emit Socket.io event
                    if (config.socketEnabled) {
                        this.emitNewLead(lead);
                    }
                }

                // Rate limit between subreddits (Reddit allows ~60 req/min for unauthenticated)
                await new Promise(r => setTimeout(r, 2000)); // 2 seconds between subs

            } catch (err) {
                stats.errors++;
                console.error(`   ❌ Error in r/${sub}:`, err.message);
            }
        }

        // Update config with run stats
        await config.updateRunStats(stats);

        console.log(`📊 Reddit Monitor [${configId}]: ${stats.leadsFound} leads found (${stats.postsChecked} posts checked, ${stats.subredditsSearched} subs)`);

        return stats;
    }

    /**
     * Start scheduled monitoring for a config
     */
    startMonitor(configId, intervalMinutes = 30) {
        if (this.intervals.has(configId)) {
            console.log(`Monitor ${configId} already running`);
            return;
        }

        console.log(`🚀 Starting Reddit monitor: ${configId} (every ${intervalMinutes} min)`);

        // Delay first run by 5 minutes to avoid rate limits on startup
        setTimeout(() => {
            this.runMonitor(configId);
        }, 5 * 60 * 1000);

        // Schedule periodic runs
        const intervalMs = intervalMinutes * 60 * 1000;
        const interval = setInterval(() => {
            this.runMonitor(configId);
        }, intervalMs);

        this.intervals.set(configId, interval);
    }

    /**
     * Stop a specific monitor
     */
    stopMonitor(configId) {
        if (this.intervals.has(configId)) {
            clearInterval(this.intervals.get(configId));
            this.intervals.delete(configId);
            console.log(`⏹️  Stopped Reddit monitor: ${configId}`);
        }
    }

    /**
     * Start all active monitors
     */
    async startAllMonitors() {
        if (!this.initialized) {
            console.log('⚠️  Reddit Monitor not initialized. Cannot start monitors.');
            return;
        }

        try {
            const configs = await RedditMonitorConfig.find({ isActive: true });

            if (configs.length === 0) {
                console.log('ℹ️  No active Reddit monitors found');
                return;
            }

            for (const config of configs) {
                this.startMonitor(config.monitorId, config.intervalMinutes || 30);
            }

            console.log(`✅ Started ${configs.length} Reddit monitor(s)`);
        } catch (err) {
            console.error('❌ Error starting monitors:', err.message);
        }
    }

    /**
     * Stop all monitors
     */
    stopAllMonitors() {
        for (const [configId] of this.intervals) {
            this.stopMonitor(configId);
        }
        console.log('⏹️  All Reddit monitors stopped');
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            mode: 'RSS',
            activeMonitors: Array.from(this.intervals.keys()),
            socketConnected: !!this.io
        };
    }
}

// Export singleton instance
module.exports = new RedditMonitorService();
