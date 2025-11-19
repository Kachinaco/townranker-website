# Schedule Component Integration - TownRanker Dashboard

## Summary

The Google Calendar iframe on the TownRanker admin dashboard has been replaced with a modern, interactive Employee Schedule Management component built with React 18.

## Changes Made

### 1. Files Added

- **`/public/types.js`** - Type definitions and constants (role colors, hourly rates)
- **`/public/components/Schedule.jsx`** - Main schedule component (React)
- **`/public/components/README.md`** - Full component documentation
- **`/public/components/QUICKSTART.md`** - Quick start guide
- **`/public/components/.htaccess`** - Apache config for serving .jsx files
- **`/public/schedule-demo.html`** - Standalone demo page

### 2. Files Modified

- **`/public/login.html`** - Dashboard page with integrated Schedule component

### 3. Backups Created

- **`/public/login.html.backup-YYYYMMDD-HHMMSS`** - Backup of original dashboard

## What Changed in login.html

### Added to `<head>` (before `</head>`):

```html
<!-- Tailwind CSS for Schedule Component -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Import Maps for React Schedule Component -->
<script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.2.0",
      "react-dom": "https://esm.sh/react-dom@18.2.0",
      "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
      "lucide-react": "https://esm.sh/lucide-react@0.263.1"
    }
  }
</script>
```

### Replaced in Dashboard Section:

**OLD** (lines ~2359-2425):
```html
<!-- Interactive Google Calendar -->
<div class="calendar-embed-container">
  <!-- Google Calendar iframe and controls -->
</div>
```

**NEW**:
```html
<!-- Employee Schedule Component -->
<div id="schedule-container" style="...">
  <!-- React Schedule Component will mount here -->
</div>
```

### Added Before `</body>`:

```html
<!-- Employee Schedule Component Initialization -->
<script type="module">
  // React app initialization for Schedule component
  // Includes sample employee and shift data
  // Auto-initializes when dashboard becomes visible
</script>
```

## Features Available

### Resource Timeline View
- **Y-Axis**: Employee list with avatars, names, and roles
- **X-Axis**: Days of the current week (Mon-Sun)
- **Grid Cells**: Shows scheduled shifts for each employee/day combination

### Interactive Features
- ✅ Click empty cell to add new shift
- ✅ Delete shift by clicking X on shift card
- ✅ Week navigation (Previous/Next/Today buttons)
- ✅ Color-coded shifts by role
- ✅ Metrics dashboard (Total Hours, Estimated Cost)
- ✅ Today indicator (highlighted in blue)
- ✅ AI Auto-Schedule button (with mock AI generation)

### Role Colors
- **Manager**: Purple
- **Server**: Blue
- **Cook**: Orange
- **Bartender**: Green
- **Host**: Pink
- **Busser**: Yellow

## Current Data Source

The component currently uses **sample data** with 6 employees and auto-generated shifts for the current week.

### Sample Employees:
1. Sarah Johnson - Manager
2. Mike Chen - Server
3. Emily Davis - Cook
4. James Wilson - Bartender
5. Lisa Anderson - Host
6. Tom Martinez - Busser

## Next Steps - Backend Integration

To connect this to your actual employee and shift data:

### 1. Create API Endpoints

```javascript
// In server.js or routes file
app.get('/api/employees', async (req, res) => {
  // Fetch from database
  const employees = await Employee.find();
  res.json(employees);
});

app.get('/api/shifts', async (req, res) => {
  // Fetch from database
  const shifts = await Shift.find();
  res.json(shifts);
});

app.post('/api/shifts', async (req, res) => {
  // Create new shift
  const shift = await Shift.create(req.body);
  res.json(shift);
});

app.delete('/api/shifts/:id', async (req, res) => {
  // Delete shift
  await Shift.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});
```

### 2. Update Schedule Initialization

In `login.html`, find the TODO comments and uncomment the API calls:

```javascript
// Around line 9132-9141
useEffect(() => {
  fetch('/api/employees')
    .then(res => res.json())
    .then(data => setEmployees(data));

  fetch('/api/shifts')
    .then(res => res.json())
    .then(data => setShifts(data));
}, []);
```

### 3. Database Schema

You'll need collections/tables for:

**Employees:**
```javascript
{
  id: String,
  name: String,
  role: String,  // Manager, Server, Cook, etc.
  avatar: String  // URL to avatar image
}
```

**Shifts:**
```javascript
{
  id: String,
  employeeId: String,
  employeeName: String,
  date: String,  // YYYY-MM-DD
  startTime: String,  // HH:mm
  endTime: String,  // HH:mm
  role: String
}
```

## Customization

### Change Role Colors

Edit `/public/types.js`:
```javascript
export const ROLE_COLORS = {
  'Manager': 'bg-indigo-600',  // Change to any Tailwind color
  'YourCustomRole': 'bg-teal-500',
  // ...
};
```

### Adjust Hourly Rates

Edit `/public/types.js`:
```javascript
export const HOURLY_RATES = {
  'Manager': 30,  // Update rates
  'Server': 15,
  // ...
};
```

## Testing

### 1. Access Dashboard
```
https://townranker.com/login.html
```
Login with your credentials to see the new schedule.

### 2. Standalone Demo
```
https://townranker.com/schedule-demo.html
```
View the component in isolation.

### 3. Browser Console
Open browser DevTools and check console for:
- "Schedule component initialized" - Component loaded
- Shift add/delete logs - Component interactions working

## Rollback

If you need to rollback to the Google Calendar:

```bash
cd /var/www/townranker.com/public
cp login.html.backup-YYYYMMDD-HHMMSS login.html
pm2 restart townranker-production
```

Replace `YYYYMMDD-HHMMSS` with the actual backup timestamp.

## Support

- **Component Documentation**: `/public/components/README.md`
- **Quick Start Guide**: `/public/components/QUICKSTART.md`
- **Demo Page**: `/public/schedule-demo.html`

## Compatibility

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (14+)
- ✅ Mobile browsers (responsive)

## Performance

- No build step required
- CDN-served dependencies
- Efficient React rendering
- Minimal bundle size

---

**Integration Date**: November 18, 2025
**Status**: ✅ Active
**Original Calendar**: Backed up and preserved
