# Employee Schedule Management Component

A comprehensive React-based employee scheduling system with a resource timeline view, built for TownRanker.

## Features

### 📅 Resource Timeline Grid
- **Y-Axis**: Employee list with avatars, names, and roles (sticky positioning)
- **X-Axis**: Days of the current week (sticky positioning)
- **Grid Cells**: Intersection of employee and day showing scheduled shifts

### 🎨 Visual Elements
- **Color-Coded Shifts**: Each role has a distinct color
  - Manager: Purple
  - Server: Blue
  - Cook: Orange
  - Bartender: Green
  - Host: Pink
  - Busser: Yellow
- **Shift Cards**: Display start/end times and role within grid cells
- **Today Indicator**: Current day highlighted in blue

### ⚡ Interactivity
- **Add Shift**: Click any empty cell to open modal for adding shifts
- **Delete Shift**: Click X on shift card to remove
- **Week Navigation**: Previous Week, Next Week, and Today buttons
- **Metrics Dashboard**: Shows total hours and estimated cost for visible week

### 🤖 AI Features
- **AI Auto-Schedule**: Button to open modal for AI-powered scheduling
- **Smart Generation**: Mock AI that creates optimized schedules based on requirements
- **Requirement Input**: Text area to describe scheduling needs

## File Structure

```
/public/
├── types.js                     # Type definitions and constants
├── components/
│   ├── Schedule.jsx            # Main schedule component
│   └── README.md               # This file
└── schedule-demo.html          # Demo page showing component usage
```

## Installation & Setup

### 1. Using Import Maps (No Build Step)

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.tailwindcss.com"></script>
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
</head>
<body>
  <div id="root"></div>

  <script type="module">
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import Schedule from './components/Schedule.jsx';

    // Your app code here...
  </script>
</body>
</html>
```

### 2. Component Props

```javascript
<Schedule
  employees={employees}         // Array of Employee objects
  shifts={shifts}              // Array of Shift objects
  onAddShift={handleAddShift}  // Function to handle new shift
  onUpdateShift={handleUpdate} // Function to handle shift updates
  onDeleteShift={handleDelete} // Function to handle shift deletion
/>
```

## Data Types

### Employee Object
```javascript
{
  id: 'emp-1',              // Unique identifier
  name: 'Sarah Johnson',    // Full name
  role: 'Manager',          // Role (Manager, Server, Cook, etc.)
  avatar: 'url-to-image'    // Avatar image URL (optional)
}
```

### Shift Object
```javascript
{
  id: 'shift-1',                    // Unique identifier
  employeeId: 'emp-1',              // Reference to employee
  employeeName: 'Sarah Johnson',    // Employee name (denormalized)
  date: '2025-11-18',              // Date in YYYY-MM-DD format
  startTime: '09:00',              // Start time in HH:mm format
  endTime: '17:00',                // End time in HH:mm format
  role: 'Manager'                  // Role for this shift
}
```

## Usage Example

```javascript
import React, { useState } from 'react';
import Schedule from './components/Schedule.jsx';

function App() {
  const [employees] = useState([
    {
      id: 'emp-1',
      name: 'Sarah Johnson',
      role: 'Manager',
      avatar: 'https://example.com/avatar1.jpg'
    }
    // ... more employees
  ]);

  const [shifts, setShifts] = useState([]);

  const handleAddShift = (newShift) => {
    setShifts([...shifts, newShift]);
  };

  const handleDeleteShift = (shiftId) => {
    setShifts(shifts.filter(s => s.id !== shiftId));
  };

  return (
    <Schedule
      employees={employees}
      shifts={shifts}
      onAddShift={handleAddShift}
      onDeleteShift={handleDeleteShift}
    />
  );
}
```

## Customization

### Role Colors
Edit `/public/types.js` to customize role colors:

```javascript
export const ROLE_COLORS = {
  'Manager': 'bg-purple-500',
  'YourRole': 'bg-teal-500',  // Add custom roles
  // ...
};
```

### Hourly Rates
Edit `/public/types.js` to customize hourly rates for cost calculation:

```javascript
export const HOURLY_RATES = {
  'Manager': 25,
  'YourRole': 20,  // Add custom rates
  // ...
};
```

## Key Features Breakdown

### Week Navigation
- **Previous/Next Week**: Navigate through weeks
- **Today Button**: Jump back to current week
- **Date Range Display**: Shows full week range in header

### Metrics Calculation
- **Total Hours**: Sum of all shift hours for the visible week
- **Estimated Cost**: Hours × hourly rate for each shift
- **Real-time Updates**: Recalculates on shift add/delete

### Shift Management
- **Add Shift**: Click empty cell → Modal → Fill details → Add
- **Delete Shift**: Click X on shift card
- **Visual Feedback**: Hover effects, color coding, time display

### AI Auto-Schedule
- **Requirements Input**: Describe needs in natural language
- **Mock Generation**: Creates alternating shift patterns
- **Integration Ready**: Replace mock logic with real AI service

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (requires import maps polyfill for older versions)

## Dependencies

- **React 18**: Core framework
- **Lucide React**: Icon library
- **Tailwind CSS**: Styling framework

All dependencies loaded via CDN/ESM (no build step required).

## Performance Notes

- Sticky positioning for headers (CSS-based, no JS)
- Memoized calculations for metrics
- Optimized re-renders with React hooks
- Efficient grid layout with CSS Grid

## Future Enhancements

- [ ] Drag-and-drop shift rescheduling
- [ ] Multi-day shift spanning
- [ ] Employee availability tracking
- [ ] Conflict detection
- [ ] Export to PDF/Excel
- [ ] Real AI integration
- [ ] Mobile responsive view
- [ ] Print-friendly layout

## Troubleshooting

### Import Maps Not Working
- Ensure your server serves `.jsx` files with correct MIME type
- For Apache, add to `.htaccess`:
  ```
  AddType text/javascript .jsx
  ```

### Tailwind Classes Not Applied
- Verify Tailwind CDN script is loaded
- Check for CSS conflicts with existing styles

### Icons Not Displaying
- Confirm `lucide-react` is loaded via import map
- Check browser console for import errors

## Support

For issues or questions, refer to:
- Demo page: `/schedule-demo.html`
- TownRanker documentation
- React 18 documentation
- Tailwind CSS documentation

---

Built with ❤️ for TownRanker
