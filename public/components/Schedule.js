console.log('Loading Schedule.jsx module...');
import React, { useState, useEffect, useMemo, createElement } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Plus,
  X,
  Sparkles,
  DollarSign,
  Clock
} from 'lucide-react';
const ROLE_COLORS = {
  "Manager": "bg-purple-500",
  "Server": "bg-blue-500",
  "Cook": "bg-orange-500",
  "Bartender": "bg-green-500",
  "Host": "bg-pink-500",
  "Busser": "bg-yellow-500",
  "Default": "bg-slate-500"
};

const HOURLY_RATES = {
  "Manager": 25,
  "Server": 12,
  "Cook": 18,
  "Bartender": 15,
  "Host": 13,
  "Busser": 11,
  "Default": 15
};

import htm from 'htm';

const html = htm.bind(createElement);

/**
 * Schedule Component - Resource Timeline View
 * Displays employee shifts in a grid layout with week navigation
 */
export default function Schedule({ employees = [], shifts = [], onAddShift, onUpdateShift, onDeleteShift }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [newShift, setNewShift] = useState({
    employeeId: '',
    date: '',
    startTime: '09:00',
    endTime: '17:00',
    role: ''
  });
  const [aiRequirements, setAIRequirements] = useState('');

  // Calculate week dates
  const weekDates = useMemo(() => {
    const dates = [];
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Start on Monday
    startOfWeek.setDate(diff);

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  }, [currentDate]);

  // Format date for display
  const formatDate = (date) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days[date.getDay()];
    const dateNum = date.getDate();
    return { day, dateNum };
  };

  // Format date to YYYY-MM-DD
  const toDateString = (date) => {
    return date.toISOString().split('T')[0];
  };

  // Get shifts for a specific employee and date
  const getShiftsForCell = (employeeId, date) => {
    const dateStr = toDateString(date);
    return shifts.filter(
      shift => shift.employeeId === employeeId && shift.date === dateStr
    );
  };

  // Calculate total hours for a shift
  const calculateHours = (startTime, endTime) => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const start = startHour + startMin / 60;
    const end = endHour + endMin / 60;
    return end - start;
  };

  // Calculate metrics for the week
  const weekMetrics = useMemo(() => {
    let totalHours = 0;
    let totalCost = 0;

    weekDates.forEach(date => {
      const dateStr = toDateString(date);
      const dayShifts = shifts.filter(shift => shift.date === dateStr);

      dayShifts.forEach(shift => {
        const hours = calculateHours(shift.startTime, shift.endTime);
        const rate = HOURLY_RATES[shift.role] || HOURLY_RATES.Default;
        totalHours += hours;
        totalCost += hours * rate;
      });
    });

    return { totalHours, totalCost };
  }, [shifts, weekDates]);

  // Navigate to previous week
  const previousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  // Navigate to next week
  const nextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  // Navigate to today
  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Handle cell click to add shift
  const handleCellClick = (employee, date) => {
    const dateStr = toDateString(date);
    setSelectedCell({ employee, date: dateStr });
    setNewShift({
      employeeId: employee.id,
      date: dateStr,
      startTime: '09:00',
      endTime: '17:00',
      role: employee.role
    });
    setShowAddModal(true);
  };

  // Handle add shift
  const handleAddShift = () => {
    if (!newShift.employeeId || !newShift.date || !newShift.startTime || !newShift.endTime) {
      alert('Please fill in all fields');
      return;
    }

    const employee = employees.find(e => e.id === newShift.employeeId);
    const shift = {
      id: `shift-${Date.now()}`,
      employeeId: newShift.employeeId,
      employeeName: employee?.name || '',
      date: newShift.date,
      startTime: newShift.startTime,
      endTime: newShift.endTime,
      role: newShift.role
    };

    if (onAddShift) {
      onAddShift(shift);
    }

    setShowAddModal(false);
    setNewShift({
      employeeId: '',
      date: '',
      startTime: '09:00',
      endTime: '17:00',
      role: ''
    });
  };

  // Handle AI auto-schedule
  const handleAISchedule = () => {
    // Mock implementation - replace with actual AI logic
    console.log('AI Schedule Requirements:', aiRequirements);

    // Generate mock schedule
    const generatedShifts = [];
    employees.forEach((employee, empIndex) => {
      weekDates.forEach((date, dateIndex) => {
        // Generate shifts for alternating days
        if ((empIndex + dateIndex) % 2 === 0) {
          generatedShifts.push({
            id: `ai-shift-${Date.now()}-${empIndex}-${dateIndex}`,
            employeeId: employee.id,
            employeeName: employee.name,
            date: toDateString(date),
            startTime: empIndex % 2 === 0 ? '09:00' : '14:00',
            endTime: empIndex % 2 === 0 ? '17:00' : '22:00',
            role: employee.role
          });
        }
      });
    });

    // Call onAddShift for each generated shift
    if (onAddShift) {
      generatedShifts.forEach(shift => onAddShift(shift));
    }

    setShowAIModal(false);
    setAIRequirements('');
  };

  // Get role color
  const getRoleColor = (role) => {
    return ROLE_COLORS[role] || ROLE_COLORS.Default;
  };

  // Check if date is today
  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  return html`
    <div className="w-full h-screen flex flex-col bg-slate-50">
      <!-- Header with Metrics -->
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-slate-900">Employee Schedule</h1>

          <button
            onClick=${() => setShowAIModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <${Sparkles} size=${18} />
            AI Auto-Schedule
          </button>
        </div>

        <!-- Metrics Dashboard -->
        <div className="flex gap-4">
          <div className="flex-1 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center gap-2 text-blue-700 mb-1">
              <${Clock} size=${18} />
              <span className="text-sm font-medium">Total Hours</span>
            </div>
            <div className="text-2xl font-bold text-blue-900">
              ${weekMetrics.totalHours.toFixed(1)}h
            </div>
          </div>

          <div className="flex-1 bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="flex items-center gap-2 text-green-700 mb-1">
              <${DollarSign} size=${18} />
              <span className="text-sm font-medium">Estimated Cost</span>
            </div>
            <div className="text-2xl font-bold text-green-900">
              $${weekMetrics.totalCost.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      <!-- Week Navigation -->
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick=${previousWeek}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Previous Week"
          >
            <${ChevronLeft} size=${20} className="text-slate-600" />
          </button>

          <button
            onClick=${goToToday}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Today
          </button>

          <button
            onClick=${nextWeek}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Next Week"
          >
            <${ChevronRight} size=${20} className="text-slate-600" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-slate-700">
          <${Calendar} size=${18} />
          <span className="font-medium">
            ${weekDates[0]?.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${weekDates[6]?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      <!-- Schedule Grid -->
      <div className="flex-1 overflow-auto">
        <div className="inline-block min-w-full">
          <div className="grid" style=${{ gridTemplateColumns: '250px repeat(7, 150px)' }}>
            <!-- Header Row - Days -->
            <div className="sticky top-0 z-20 bg-slate-100 border-b-2 border-slate-300 px-4 py-3">
              <span className="font-semibold text-slate-700">Employee</span>
            </div>

            ${weekDates.map((date, idx) => {
              const { day, dateNum } = formatDate(date);
              const today = isToday(date);

              return html`
                <div
                  key=${idx}
                  className=${`sticky top-0 z-20 border-b-2 border-slate-300 px-3 py-3 text-center ${
                    today ? 'bg-blue-100 border-blue-400' : 'bg-slate-100'
                  }`}
                >
                  <div className=${`font-semibold ${today ? 'text-blue-700' : 'text-slate-700'}`}>
                    ${day}
                  </div>
                  <div className=${`text-lg ${today ? 'text-blue-900' : 'text-slate-900'}`}>
                    ${dateNum}
                  </div>
                </div>
              `;
            })}

            <!-- Employee Rows -->
            ${employees.map((employee, empIdx) => html`
              <${React.Fragment} key=${employee.id}>
                <!-- Employee Info Cell -->
                <div className="sticky left-0 z-10 bg-white border-b border-r-2 border-slate-200 px-4 py-4">
                  <div className="flex items-center gap-3">
                    <img
                      src=${employee.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(employee.name)}&background=6366f1&color=fff`}
                      alt=${employee.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div>
                      <div className="font-medium text-slate-900">${employee.name}</div>
                      <div className="text-sm text-slate-600">${employee.role}</div>
                    </div>
                  </div>
                </div>

                <!-- Shift Cells -->
                ${weekDates.map((date, dateIdx) => {
                  const cellShifts = getShiftsForCell(employee.id, date);
                  const today = isToday(date);

                  return html`
                    <div
                      key=${`${employee.id}-${dateIdx}`}
                      onClick=${() => handleCellClick(employee, date)}
                      className=${`border-b border-slate-200 p-2 min-h-[80px] cursor-pointer transition-colors ${
                        today ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      ${cellShifts.length === 0 ? html`
                        <div className="flex items-center justify-center h-full opacity-0 hover:opacity-100 transition-opacity">
                          <${Plus} size=${20} className="text-slate-400" />
                        </div>
                      ` : html`
                        <div className="space-y-2">
                          ${cellShifts.map(shift => html`
                            <div
                              key=${shift.id}
                              className=${`${getRoleColor(shift.role)} text-white rounded-md px-2 py-1 text-xs font-medium`}
                              onClick=${(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between">
                                <span>${shift.startTime} - ${shift.endTime}</span>
                                <button
                                  onClick=${(e) => {
                                    e.stopPropagation();
                                    if (onDeleteShift) onDeleteShift(shift.id);
                                  }}
                                  className="opacity-70 hover:opacity-100"
                                >
                                  <${X} size=${14} />
                                </button>
                              </div>
                              <div className="text-xs opacity-90 mt-1">
                                ${shift.role}
                              </div>
                            </div>
                          `)}
                        </div>
                      `}
                    </div>
                  `;
                })}
              </${React.Fragment}>
            `)}
          </div>
        </div>
      </div>

      <!-- Add Shift Modal -->
      ${showAddModal && html`
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">Add Shift</h2>
              <button
                onClick=${() => setShowAddModal(false)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <${X} size=${20} className="text-slate-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Employee
                </label>
                <select
                  value=${newShift.employeeId}
                  onChange=${(e) => {
                    const emp = employees.find(e => e.id === e.target.value);
                    setNewShift({ ...newShift, employeeId: e.target.value, role: emp?.role || '' });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Employee</option>
                  ${employees.map(emp => html`
                    <option key=${emp.id} value=${emp.id}>
                      ${emp.name} - ${emp.role}
                    </option>
                  `)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value=${newShift.date}
                  onChange=${(e) => setNewShift({ ...newShift, date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value=${newShift.startTime}
                    onChange=${(e) => setNewShift({ ...newShift, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value=${newShift.endTime}
                    onChange=${(e) => setNewShift({ ...newShift, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Role
                </label>
                <select
                  value=${newShift.role}
                  onChange=${(e) => setNewShift({ ...newShift, role: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Role</option>
                  ${Object.keys(ROLE_COLORS).filter(r => r !== 'Default').map(role => html`
                    <option key=${role} value=${role}>${role}</option>
                  `)}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick=${() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick=${handleAddShift}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add Shift
                </button>
              </div>
            </div>
          </div>
        </div>
      `}

      <!-- AI Auto-Schedule Modal -->
      ${showAIModal && html`
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <${Sparkles} className="text-purple-600" size=${24} />
                AI Auto-Schedule
              </h2>
              <button
                onClick=${() => setShowAIModal(false)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <${X} size=${20} className="text-slate-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Describe your scheduling requirements:
                </label>
                <textarea
                  value=${aiRequirements}
                  onChange=${(e) => setAIRequirements(e.target.value)}
                  placeholder="E.g., Need 2 servers for lunch shifts, 1 manager always on duty, avoid back-to-back shifts..."
                  rows=${6}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-sm text-purple-800">
                  <strong>AI will consider:</strong> Employee availability, labor laws, role requirements,
                  and cost optimization when generating the schedule.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick=${() => setShowAIModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick=${handleAISchedule}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                >
                  <${Sparkles} size=${18} />
                  Generate Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      `}
    </div>
  `;
}
