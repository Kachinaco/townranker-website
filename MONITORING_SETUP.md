# TownRanker Monitoring & Configuration

**Setup Date:** $(date +%Y-%m-%d)
**Status:** ✅ All recommendations implemented

---

## 🎯 Issues Resolved

### 1. Missing JavaScript File (FIXED)
**Problem:** `/seo-monitor.js` was referenced but didn't exist
- Caused 404 errors on every page load
- Search engine bots repeatedly hit these errors

**Solution:**
- Created `/var/www/townranker.com/public/seo-monitor.js`
- File now loads successfully (HTTP 200)

---

### 2. High Restart Count (ADDRESSED)
**Before:** 5,168 restarts over 37 days (~140/day)

**Root Causes Identified:**
- Missing file causing repeated errors
- High heap usage (92.49%)
- No error logging to track crashes
- No memory limits configured

**Solutions Implemented:**
- ✅ Fixed missing file
- ✅ Added comprehensive error logging
- ✅ Configured max-memory-restart (200MB)
- ✅ Limited Node.js heap to 256MB
- ✅ Created PM2 ecosystem configuration

---

## 📁 Files Created/Modified

### 1. Error Logging (`server.js`)
Added handlers for:
- Uncaught exceptions
- Unhandled promise rejections
- Errors logged to: `/var/www/townranker.com/error.log`

### 2. PM2 Ecosystem Config (`/var/www/townranker.com/ecosystem.config.js`)
```javascript
max_memory_restart: '200M'  // Auto-restart if exceeds 200MB
node_args: '--max-old-space-size=256'  // Limit V8 heap
```

### 3. Monitoring Scripts
- **Main Monitor:** `/root/townranker-monitor.sh`
  - Shows status, memory, errors, health checks
  - Run anytime: `./townranker-monitor.sh`

- **404 Monitor:** `/root/monitor-townranker-404.sh`
  - Live monitoring of 404 errors
  - Run: `./monitor-townranker-404.sh`

### 4. SEO Monitor (`/var/www/townranker.com/public/seo-monitor.js`)
- Tracks page views, link clicks, performance
- No more 404 errors

---

## 🔧 Management Commands

### Daily Monitoring
```bash
# Quick status check
./townranker-monitor.sh

# Real-time monitoring
pm2 monit

# View live logs
pm2 logs townranker-production
```

### Troubleshooting
```bash
# Check application errors
tail -f /var/www/townranker.com/error.log

# Check 404 errors
sudo tail -f /var/log/nginx/townranker.com.error.log

# Check PM2 details
pm2 describe townranker-production

# Restart if needed
pm2 restart townranker-production
```

### Performance Checks
```bash
# Check heap usage
pm2 describe townranker-production | grep -A6 "Code metrics"

# Check restart count
pm2 list | grep townranker

# Test endpoints
curl -I http://localhost:3001/
curl -I http://localhost:3001/seo-monitor.js
```

---

## 📊 Current Configuration

| Setting | Value |
|---------|-------|
| Max Memory Restart | 200 MB |
| Node Heap Limit | 256 MB |
| Auto Restart | Enabled |
| Error Logging | Enabled |
| PM2 Crash Protection | Max 10 restarts in 10s |

---

## 🎯 Expected Improvements

1. **Restart Count:** Should drop significantly (from 140/day to <10/day)
2. **404 Errors:** Should be eliminated for seo-monitor.js
3. **Error Visibility:** All crashes now logged to error.log
4. **Memory Management:** Auto-restart prevents memory leaks from crashing server
5. **Stability:** Application will self-recover from crashes

---

## 📈 Monitoring Schedule

### Daily
- Run `townranker-monitor.sh` to check status
- Check restart count: `pm2 list`

### Weekly
- Review error.log: `cat /var/www/townranker.com/error.log`
- Check nginx error logs: `sudo tail -100 /var/log/nginx/townranker.com.error.log`

### Monthly
- Clear old logs if needed
- Review restart patterns
- Optimize if heap usage trends upward

---

## 🚨 Alert Thresholds

Watch for these conditions:
- **Restart count > 20/day** → Investigate error.log
- **Heap usage > 95%** → Memory leak likely
- **Event loop latency > 100ms** → Performance issue
- **Multiple 404s** → Missing files

---

## 📝 Notes

- Old 404 errors in logs are from BEFORE seo-monitor.js was created
- New visits should NOT produce seo-monitor.js 404 errors
- Application will auto-restart if memory exceeds 200MB
- PM2 saves configuration automatically on restart
- Restart counter reset to 0 with new configuration

---

**Last Updated:** $(date)
**Maintained By:** Claude AI Assistant
