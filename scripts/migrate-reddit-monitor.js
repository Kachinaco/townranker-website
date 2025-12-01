#!/usr/bin/env node
/**
 * Migration Script: Reddit Monitor System
 * Migrates existing phoenix-lead-system config to new integrated TownRanker system
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import models
const RedditLead = require('../server/models/RedditLead');
const RedditMonitorConfig = require('../server/models/RedditMonitorConfig');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/townranker';
const OLD_CONFIG_PATH = '/root/scripts/phoenix-lead-system/monitors/phoenix-windows.json';

async function migrate() {
    console.log('🔄 Starting Reddit Monitor Migration...\n');

    try {
        // Connect to MongoDB
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Step 1: Migrate Configuration
        console.log('📋 Step 1: Migrating monitor configuration...');

        if (!fs.existsSync(OLD_CONFIG_PATH)) {
            console.log('   ⚠️  Old config file not found. Skipping config migration.');
        } else {
            const oldConfig = JSON.parse(fs.readFileSync(OLD_CONFIG_PATH, 'utf8'));

            // Check if already migrated
            const existing = await RedditMonitorConfig.findOne({ monitorId: 'phoenix-windows' });
            if (existing) {
                console.log('   ⏭️  Config already exists. Updating...');
                await RedditMonitorConfig.updateOne(
                    { monitorId: 'phoenix-windows' },
                    {
                        name: oldConfig.name,
                        businessName: oldConfig.businessName,
                        targetSubreddits: oldConfig.targetSubreddits?.map(s => s.toLowerCase()) || [],
                        searchTerms: ['window', 'door', 'glass', 'windows', 'doors'],
                        highIntentPhrases: oldConfig.highIntentPhrases || [],
                        serviceKeywords: oldConfig.serviceKeywords || [],
                        locationKeywords: oldConfig.locationKeywords || [],
                        exclusionKeywords: oldConfig.exclusionKeywords || [],
                        scoring: oldConfig.scoring || {},
                        slackWebhookUrl: oldConfig.notifications?.slack?.webhookUrl,
                        slackEnabled: oldConfig.notifications?.slack?.enabled !== false,
                        intervalMinutes: oldConfig.schedule?.intervalMinutes || 30,
                        isActive: true,
                        location: oldConfig.location || 'Phoenix, Arizona',
                        timezone: oldConfig.timezone || 'America/Phoenix'
                    }
                );
                console.log('   ✅ Config updated');
            } else {
                const newConfig = new RedditMonitorConfig({
                    monitorId: 'phoenix-windows',
                    name: oldConfig.name || 'Phoenix Windows & Doors Monitor',
                    businessName: oldConfig.businessName || 'Windows & Doors Near Me',
                    description: oldConfig.description || 'Reddit lead monitor for Phoenix metro area window and door services',
                    targetSubreddits: oldConfig.targetSubreddits?.map(s => s.toLowerCase()) || [
                        'phoenix', 'arizona', 'gilbert', 'mesa', 'chandler', 'tempe',
                        'scottsdale', 'glendale', 'peoria', 'surprise', 'goodyear'
                    ],
                    searchTerms: ['window', 'door', 'glass', 'windows', 'doors'],
                    highIntentPhrases: oldConfig.highIntentPhrases || [],
                    serviceKeywords: oldConfig.serviceKeywords || [],
                    locationKeywords: oldConfig.locationKeywords || [],
                    exclusionKeywords: oldConfig.exclusionKeywords || [],
                    scoring: oldConfig.scoring || {
                        highIntentWeight: 30,
                        serviceWeight: 15,
                        locationWeight: 10,
                        minScore: 30,
                        thresholds: { high: 60, medium: 40 }
                    },
                    slackWebhookUrl: oldConfig.notifications?.slack?.webhookUrl,
                    slackEnabled: oldConfig.notifications?.slack?.enabled !== false,
                    socketEnabled: true,
                    intervalMinutes: oldConfig.schedule?.intervalMinutes || 30,
                    isActive: true,
                    location: oldConfig.location || 'Phoenix, Arizona',
                    timezone: oldConfig.timezone || 'America/Phoenix'
                });

                await newConfig.save();
                console.log('   ✅ Config migrated successfully');
            }
        }

        // Step 2: Migrate Existing Leads from old collection
        console.log('\n📋 Step 2: Migrating existing leads...');

        // Get leads from the old 'leads' collection that are from Reddit
        const db = mongoose.connection.db;
        const oldLeadsCollection = db.collection('leads');

        const redditLeads = await oldLeadsCollection.find({
            $or: [
                { source: /^reddit-/ },
                { redditPostId: { $exists: true } }
            ]
        }).toArray();

        console.log(`   Found ${redditLeads.length} Reddit leads to migrate`);

        let migrated = 0;
        let skipped = 0;

        for (const lead of redditLeads) {
            // Skip if already in new collection
            const existing = await RedditLead.findOne({ redditPostId: lead.redditPostId });
            if (existing) {
                skipped++;
                continue;
            }

            try {
                const newLead = new RedditLead({
                    redditPostId: lead.redditPostId,
                    redditUrl: lead.redditLink || `https://reddit.com/comments/${lead.redditPostId}`,
                    subreddit: lead.redditSubreddit || 'unknown',
                    author: lead.author,
                    title: lead.redditTitle || lead.name || 'Reddit Lead',
                    selftext: lead.message,
                    score: lead.score || 50,
                    priority: lead.priority || 'medium',
                    serviceMatches: lead.serviceMatches || [],
                    intentMatches: lead.intentMatches || [],
                    locationMatches: lead.locationMatches || [],
                    monitorId: lead.monitorId || 'phoenix-windows',
                    monitorName: lead.monitorName || 'Phoenix Windows & Doors Monitor',
                    status: lead.status === 'new' ? 'new' : 'reviewed',
                    slackSent: true,
                    discoveredAt: lead.createdAt || new Date()
                });

                await newLead.save();
                migrated++;
            } catch (err) {
                console.log(`   ⚠️  Failed to migrate lead ${lead.redditPostId}: ${err.message}`);
            }
        }

        console.log(`   ✅ Migrated ${migrated} leads (${skipped} already existed)`);

        // Step 3: Summary
        console.log('\n📊 Migration Summary:');

        const configCount = await RedditMonitorConfig.countDocuments();
        const leadCount = await RedditLead.countDocuments();

        console.log(`   • Monitor Configs: ${configCount}`);
        console.log(`   • Reddit Leads: ${leadCount}`);

        console.log('\n✅ Migration complete!\n');
        console.log('Next steps:');
        console.log('1. Add Reddit API credentials to .env file');
        console.log('2. Restart TownRanker server: pm2 restart townranker');
        console.log('3. Check logs for Reddit Monitor initialization');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.connection.close();
    }
}

migrate();
