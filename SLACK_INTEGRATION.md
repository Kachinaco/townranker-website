# TownRanker Slack Integration

**Date:** 2025-10-18
**Status:** ✅ Active

---

## 🎯 Overview

TownRanker now sends real-time notifications to Slack for leads and health monitoring.

---

## 📬 Slack Channels

### 1. Lead Notifications
**Webhook:** `https://hooks.slack.com/services/T09MB3T7P8S/B09M4MBF4TD/...`
**Purpose:** New lead notifications from contact form submissions

**What gets sent:**
- Lead name, email, phone
- Project type and budget
- Package tier (Starter/Growth/Professional/Business/Enterprise)
- Message from customer
- Action reminder: Contact within 2 hours
- Lead ID for reference

**Example notification:**
```
🎯 New Lead from TownRanker!

Name: John Smith
Email: john@example.com
Phone: 555-1234
Project Type: Business Website
Budget: $17,500
Package: Professional Package

Message: Looking to build a new website for my business

⏰ Action Required: Contact within 2 hours | Lead ID: 68f4752d...
```

### 2. Site Health Alerts
**Webhook:** `https://hooks.slack.com/services/T09MB3T7P8S/B09MB3ZC4SW/...`
**Purpose:** Server health monitoring and error alerts

**What gets sent:**

**Success Events:**
- ✅ Server startup notifications
- Port, environment, Node version

**Warning Events:**
- ⚠️ Resource usage warnings
- Configuration issues

**Error Events:**
- 🔴 Uncaught exceptions
- 🔴 Unhandled promise rejections
- 🔴 Server crashes with error details

**Example health notification:**
```
✅ TownRanker Health Alert

Status: SUCCESS
Message: TownRanker server started successfully

Port: 3001
Environment: production
Node Version: v20.x.x

Timestamp: 2025-10-18T22:07:15.000Z
```

**Example error notification:**
```
🔴 TownRanker Health Alert

Status: ERROR
Message: Uncaught Exception - Server Crashed

Error: TypeError
Message: Cannot read property 'x' of undefined
Stack: at /var/www/townranker.com/server.js:1234:5
       at process.processTicksAndRejections...

Timestamp: 2025-10-18T22:15:00.000Z
```

---

## 🔧 Configuration

### Environment Variables
Located in `/var/www/townranker.com/.env`:

```bash
# Slack Webhooks
SLACK_WEBHOOK_LEADS=https://hooks.slack.com/services/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
SLACK_WEBHOOK_HEALTH=https://hooks.slack.com/services/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
```

### Code Implementation
Located in `/var/www/townranker.com/server.js`:

**Helper Functions** (Lines 805-940):
- `sendSlackNotification()` - Core Slack API wrapper
- `notifySlackNewLead()` - Format and send lead notifications
- `notifySlackHealth()` - Format and send health alerts

**Integration Points:**
- Line 1145: Lead notification in `/api/contact` endpoint
- Line 2670: Health notification on server startup
- Line 2706: Error notification on uncaught exceptions
- Line 2726: Error notification on unhandled rejections

---

## 📊 Notification Triggers

### Lead Notifications
**Trigger:** New contact form submission via `/api/contact`
**Timing:** Immediately after lead is saved to database
**Sequence:**
1. Form submitted
2. Lead validated
3. Lead saved to MongoDB
4. In-app notification created
5. ✅ **Slack notification sent**
6. Email notifications sent
7. Success response to user

### Health Notifications
**Server Startup:**
- **Trigger:** Server successfully starts listening on port
- **Timing:** 2 seconds after startup
- **Details:** Port, environment, Node version

**Uncaught Exceptions:**
- **Trigger:** Any unhandled error in the application
- **Timing:** Immediately before process exits
- **Details:** Error name, message, stack trace (first 3 lines)

**Unhandled Rejections:**
- **Trigger:** Unhandled promise rejection
- **Timing:** Immediately before process exits
- **Details:** Rejection reason and type

---

## 🧪 Testing

### Test Lead Notification
```bash
curl -X POST http://localhost:3001/api/contact \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Lead",
    "email": "test@example.com",
    "phone": "555-TEST",
    "message": "Testing Slack integration",
    "project_type": "new_website",
    "budget": "10k-25k"
  }'

# Check logs for: ✅ Slack notification sent
pm2 logs townranker-production --lines 20
```

### Test Health Notification
```bash
# Restart server to trigger startup notification
pm2 restart townranker-production

# Check logs for: ✅ Slack notification sent
pm2 logs townranker-production --lines 30 | grep Slack
```

---

## 🔍 Monitoring & Troubleshooting

### Check if Notifications are Working
```bash
# View recent logs
pm2 logs townranker-production --lines 50 | grep "Slack"

# Should see:
# ✅ Slack notification sent
```

### Common Issues

**No notifications received:**
1. Check webhook URLs are correct in `.env`
2. Verify environment variables loaded: `pm2 restart townranker-production --update-env`
3. Check Slack webhook is not expired or revoked
4. View error logs: `pm2 logs townranker-production --err --lines 50`

**Notification sent but not appearing in Slack:**
1. Verify webhook URL is active (test with curl)
2. Check Slack channel permissions
3. Ensure webhook isn't rate-limited

**Partial information in notifications:**
1. Check lead data has required fields (name, email, phone)
2. Verify budget mapping is working (see LEAD_FORM_FIX.md)

### Test Webhook Manually
```bash
# Test leads webhook
curl -X POST https://hooks.slack.com/services/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 \
  -H "Content-Type: application/json" \
  -d '{"text": "Test from command line"}'

# Test health webhook
curl -X POST https://hooks.slack.com/services/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 \
  -H "Content-Type: application/json" \
  -d '{"text": "Health check from command line"}'
```

---

## 📈 Verification Results

**Date:** 2025-10-18 22:07 MST

### Health Notification Test
```
✅ Server startup notification sent successfully
Server: TownRanker (port 3001)
Environment: production
Node: v20.x.x
```

### Lead Notification Test
```
✅ Lead notification sent successfully
Lead: Slack Test Lead
Email: slacktest@example.com
Phone: 555-SLACK
Budget: $37,500 (Business Package)
Project: Business Website
```

**Both tests passed** - Slack integration is fully operational!

---

## 🚀 Benefits

1. **Real-time Lead Alerts** - Get notified instantly when new leads come in
2. **Mobile Notifications** - Receive alerts on Slack mobile app
3. **Error Monitoring** - Know immediately when server issues occur
4. **Reduced Response Time** - Act on leads within minutes instead of hours
5. **Team Visibility** - All team members see leads and health status
6. **Historical Record** - Slack maintains searchable history of all alerts

---

## 🔐 Security Notes

- Webhook URLs are stored in `.env` (not committed to git)
- Webhooks are unique to TownRanker workspace
- Revoking webhooks in Slack will stop notifications
- No sensitive customer data beyond name/email/phone is sent
- Error notifications sanitize stack traces (first 3 lines only)

---

## 📝 Future Enhancements

Potential additions:
- [ ] Lead assignment notifications ("Lead assigned to you")
- [ ] Lead status change notifications ("Lead converted to customer")
- [ ] Performance metrics (daily/weekly summaries)
- [ ] Email bounce notifications
- [ ] OpenPhone SMS notifications integration
- [ ] Workflow completion alerts
- [ ] Monthly revenue reports

---

**Last Updated:** 2025-10-18 22:10 MST
**Configured By:** Claude AI Assistant
**Status:** ✅ Production Ready
