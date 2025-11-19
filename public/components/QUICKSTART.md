# Quick Start Guide - Employee Schedule Component

Get the schedule component running in 5 minutes!

## 🚀 Instant Demo

1. **Navigate to the demo page:**
   ```
   http://yourdomain.com/schedule-demo.html
   ```

2. **That's it!** The component is already running with sample data.

## 📝 Integration Steps

### Step 1: Add to Your HTML Page

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Schedule Page</title>

  <!-- 1. Add Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- 2. Add Import Maps -->
  <script type="importmap">
    {
      "imports": {
        "react": "https://esm.sh/react@18.2.0",
        "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
        "lucide-react": "https://esm.sh/lucide-react@0.263.1"
      }
    }
  </script>
</head>
<body>
  <div id="root"></div>

  <!-- 3. Add Your App Code -->
  <script type="module">
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import Schedule from './components/Schedule.jsx';

    function App() {
      // Your state management here
      const [employees, setEmployees] = useState([]);
      const [shifts, setShifts] = useState([]);

      return React.createElement(Schedule, {
        employees,
        shifts,
        onAddShift: (shift) => setShifts([...shifts, shift]),
        onDeleteShift: (id) => setShifts(shifts.filter(s => s.id !== id))
      });
    }

    createRoot(document.getElementById('root')).render(
      React.createElement(App)
    );
  </script>
</body>
</html>
```

### Step 2: Prepare Your Data

```javascript
// Sample employee data
const employees = [
  {
    id: 'emp-1',
    name: 'John Doe',
    role: 'Manager',
    avatar: 'https://example.com/avatar.jpg'
  }
];

// Sample shift data
const shifts = [
  {
    id: 'shift-1',
    employeeId: 'emp-1',
    employeeName: 'John Doe',
    date: '2025-11-18',
    startTime: '09:00',
    endTime: '17:00',
    role: 'Manager'
  }
];
```

### Step 3: Connect to Your Backend (Optional)

```javascript
// Fetch employees from your API
useEffect(() => {
  fetch('/api/employees')
    .then(res => res.json())
    .then(data => setEmployees(data));
}, []);

// Fetch shifts from your API
useEffect(() => {
  fetch('/api/shifts')
    .then(res => res.json())
    .then(data => setShifts(data));
}, []);

// Save new shift to backend
const handleAddShift = async (newShift) => {
  const response = await fetch('/api/shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newShift)
  });

  if (response.ok) {
    const savedShift = await response.json();
    setShifts([...shifts, savedShift]);
  }
};
```

## 🎯 Common Use Cases

### 1. Basic Implementation (Static Data)
```javascript
// Use the demo page as-is with hardcoded data
// Perfect for testing and prototyping
```

### 2. Local Storage Persistence
```javascript
// Save to localStorage
const handleAddShift = (shift) => {
  const newShifts = [...shifts, shift];
  setShifts(newShifts);
  localStorage.setItem('shifts', JSON.stringify(newShifts));
};

// Load from localStorage on mount
useEffect(() => {
  const saved = localStorage.getItem('shifts');
  if (saved) setShifts(JSON.parse(saved));
}, []);
```

### 3. Backend Integration
```javascript
// See Step 3 above for full backend integration
```

## 🛠️ Customization Quick Tips

### Change Role Colors
Edit `/public/types.js`:
```javascript
export const ROLE_COLORS = {
  'Manager': 'bg-indigo-600',  // Change to your color
  'Server': 'bg-cyan-500',
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

### Modify Grid Layout
In `Schedule.jsx`, find the grid style:
```javascript
style={{ gridTemplateColumns: '250px repeat(7, 150px)' }}
//                               ^employee column  ^day columns
```

## 📱 Access the Demo

1. **Start your server** (if not already running):
   ```bash
   cd /var/www/townranker.com
   npm start
   # or
   pm2 restart townranker
   ```

2. **Open in browser**:
   ```
   http://yourdomain.com/schedule-demo.html
   ```

3. **Test the features**:
   - Click empty cells to add shifts
   - Use week navigation buttons
   - Click "AI Auto-Schedule"
   - Delete shifts with the X button

## 🔧 Troubleshooting

### Component Not Showing
- Check browser console for errors
- Verify all CDN scripts loaded
- Ensure `.jsx` files served with correct MIME type

### Styles Not Applied
- Confirm Tailwind CSS script loaded
- Clear browser cache
- Check for CSS conflicts

### Import Errors
- Verify import map is defined before module scripts
- Check network tab for failed CDN requests
- Try hard refresh (Ctrl+Shift+R)

## 📚 Next Steps

- Review `/components/README.md` for detailed documentation
- Explore the demo page source code
- Integrate with your authentication system
- Add backend API endpoints
- Customize colors and styling

## 🆘 Need Help?

- Check the full README: `/components/README.md`
- Review demo page: `/schedule-demo.html`
- Inspect browser console for errors
- Verify server configuration

---

**Ready to go!** Open `/schedule-demo.html` to see it in action.
