import React from 'react';

export default function Schedule({ employees = [], shifts = [] }) {
  console.log('Schedule component rendering with:', { employees, shifts });
  
  return React.createElement('div', {
    style: {
      padding: '20px',
      background: 'white',
      borderRadius: '8px',
      border: '2px solid #6366f1'
    }
  },
    React.createElement('h2', { style: { color: '#6366f1' } }, 'Employee Schedule'),
    React.createElement('p', null, `Employees: ${employees.length}`),
    React.createElement('p', null, `Shifts: ${shifts.length}`)
  );
}
