# TownRanker Lead Form Fix - Contact Form 401 Error

**Date:** 2025-10-18
**Issue:** Public contact form was returning 401 Unauthorized errors
**Status:** ✅ FIXED

---

## 🎯 Problem Discovered

### Missed Lead
- **Time:** October 18, 2025 at 16:53 MST (4:53 PM)
- **IP Address:** 91.246.41.166
- **Browser:** Chrome on Mac OS X
- **Attempts:** 3 submissions within 10 seconds
- **Result:** All returned 401 Unauthorized
- **Data Lost:** Yes - form data not saved due to authentication error

### Root Cause
The public contact form was submitting to `/api/leads` which required admin authentication:

```javascript
// Line 1108 - server.js (OLD - BROKEN)
app.post('/api/leads', authenticateAdmin, async (req, res) => {
```

The frontend form was submitting without any auth token:
```javascript
// Line 2225 - index.html (OLD)
const response = await fetch('/api/leads', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(data)
});
```

---

## ✅ Solution Implemented

### 1. Discovered Existing Public Endpoint
Found there was already a public endpoint `/api/contact` (line 920) without authentication:
```javascript
app.post('/api/contact', async (req, res) => {
    // No authenticateAdmin middleware - public access
```

### 2. Updated Contact Form
Changed form submission endpoint from `/api/leads` to `/api/contact`:

**File:** `/var/www/townranker.com/public/index.html`
- **Line 2044:** Changed form action from `/api/leads` to `/api/contact`
- **Line 2225:** Changed fetch URL from `/api/leads` to `/api/contact`

### 3. Fixed Data Mapping Issues
The form sends snake_case field names but the database expects camelCase:

**Form sends:**
- `project_type` → Schema expects: `projectType`
- `page_url` → Schema expects: `pageUrl`
- `user_agent` → Schema expects: `userAgent`

**Budget mapping:**
- Form: `"10k-25k"` → Database: `17500` (numeric)

**Project type mapping:**
- Form: `"new_website"` → Database: `"business-website"` (enum value)

**Added field normalization in `/api/contact` endpoint (lines 948-986):**
```javascript
// Map form values to schema enum values
const projectTypeMap = {
    'new_website': 'business-website',
    'redesign': 'business-website',
    'ecommerce': 'ecommerce-store',
    'web_app': 'web-application',
    'maintenance': 'business-website',
    'other': 'business-website'
};

const budgetMap = {
    '5k-10k': 7500,
    '10k-25k': 17500,
    '25k-50k': 37500,
    '50k+': 75000
};

const normalizedData = {
    name: leadData.name,
    email: leadData.email,
    phone: leadData.phone,
    message: leadData.message,
    projectType: projectTypeMap[projectTypeValue] || 'business-website',
    budget: budgetMap[budgetValue] || parseInt(budgetValue) || 0,
    // ... other fields
};
```

### 4. Fixed Email Template
The confirmation email template was trying to access undefined fields causing crashes:

**Fixed lines 1083-1088:**
```javascript
// Before: Would crash if timeline was undefined
<p><strong>Timeline:</strong> ${lead.timeline.replace('-', ' to ')}</p>

// After: Safely handles undefined values
${lead.timeline ? `<p><strong>Timeline:</strong> ${lead.timeline === 'asap' ? 'ASAP' : lead.timeline.replace('-', ' to ')}</p>` : ''}
```

---

## 📊 Testing Results

### Before Fix
```bash
curl -X POST http://localhost:3001/api/leads -H "Content-Type: application/json" -d '{...}'
# Result: 401 Unauthorized
```

### After Fix
```bash
curl -X POST http://localhost:3001/api/contact -H "Content-Type: application/json" -d '{
  "name": "Jane Doe",
  "email": "jane.doe@example.com",
  "phone": "555-5678",
  "project_type": "new_website",
  "budget": "10k-25k"
}'

# Result:
{
  "success": true,
  "message": "Thank you! We'll contact you within 2 hours.",
  "leadId": "68f4703f093e726c31b59040"
}
```

### Database Verification
```bash
$ mongosh townranker --eval "db.leads.find().sort({createdAt: -1}).limit(2)"

[Sat Oct 18 2025 21:59:43] Jane Doe - jane.doe@example.com - 555-5678
[Sat Oct 18 2025 21:59:14] John Smith - john.smith@example.com - 555-1234
```

✅ Leads are now being saved correctly with proper field mapping

---

## 🔧 Files Modified

1. **`/var/www/townranker.com/public/index.html`**
   - Line 2044: Form action URL
   - Line 2225: Fetch endpoint URL

2. **`/var/www/townranker.com/server.js`**
   - Lines 948-986: Added data normalization and field mapping
   - Lines 1083-1088: Fixed email template to handle undefined fields

---

## ⚠️ Impact Assessment

### Missed Lead
- **1 lead was lost** on October 18, 2025 at 16:53 MST
- No way to recover contact information (not logged in nginx)
- User likely saw error message and left the site

### Lead Capture Status
- **Before fix:** All contact form submissions failing with 401 errors
- **After fix:** Contact form working correctly, leads being saved
- **Time broken:** Unknown - could have been broken since deployment
- **Fix applied:** October 18, 2025 at 21:59 MST

### How Long Was It Broken?
Looking at the database, the last successful lead before the fix was:
- August 19, 2025 (2 months ago)

This suggests the form may have been broken for approximately **2 months**, potentially losing many leads during that time.

---

## 📝 Prevention Measures

### Monitoring Recommendations
1. **Add form submission monitoring** - Track successful vs failed submissions
2. **Set up error alerting** - Get notified when 4xx/5xx errors spike
3. **Weekly lead check** - Verify leads are coming in regularly
4. **Test contact form monthly** - Ensure it's always working

### Code Improvements
1. ✅ Form now uses correct public endpoint
2. ✅ Data normalization handles form → database mapping
3. ✅ Email templates handle undefined fields gracefully
4. ❌ TODO: Add client-side error reporting to track failed submissions
5. ❌ TODO: Add server-side metrics for form submission success rate

---

## 🎯 Summary

| Metric | Value |
|--------|-------|
| **Issue** | 401 Unauthorized on contact form |
| **Root Cause** | Form used admin-only endpoint |
| **Fix** | Switched to public `/api/contact` endpoint |
| **Leads Lost** | At least 1 confirmed, possibly many more over 2 months |
| **Status** | ✅ Fixed and tested |
| **Restart Count** | 4 (from fixes, not crashes) |

---

**Last Updated:** 2025-10-18 22:00 MST
**Fixed By:** Claude AI Assistant
**Verified:** Working correctly with successful test submissions
