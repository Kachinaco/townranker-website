// Schedule Management System
let scheduleData = {
	employees: [],
	shifts: {}
};

// Load data from localStorage
function loadScheduleData() {
	const saved = localStorage.getItem('townranker_schedule');
	if (saved) {
		scheduleData = JSON.parse(saved);
	}
	renderSchedule();
}

// Save data to localStorage
function saveScheduleData() {
	localStorage.setItem('townranker_schedule', JSON.stringify(scheduleData));
	renderSchedule();
}

// Render the schedule table
function renderSchedule() {
	const tbody = document.getElementById('schedule-tbody');
	if (!tbody) return;

	const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

	if (scheduleData.employees.length === 0) {
		tbody.innerHTML = '<tr><td colspan="8" style="padding: 40px; text-align: center; color: #94a3b8;">No employees added yet. Click "+ Add Employee" to get started.</td></tr>';
		return;
	}

	tbody.innerHTML = scheduleData.employees.map(emp => {
		const empShifts = scheduleData.shifts[emp.id] || {};
		return '<tr><td style="padding: 12px; font-weight: 500; border: 1px solid #e2e8f0;">' +
			emp.name + '<br><span style="color: #64748b; font-size: 12px;">' + emp.role + '</span>' +
			'<br><button onclick="deleteEmployee(\'' + emp.id + '\')" style="margin-top: 5px; font-size: 11px; color: #ef4444; background: none; border: none; cursor: pointer;">Delete</button></td>' +
			days.map((day, idx) => {
				const shift = empShifts[idx];
				if (shift) {
					return '<td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0;"><div style="background: ' + emp.color + '; color: white; padding: 6px; border-radius: 4px; font-size: 12px; cursor: pointer;" onclick="editShift(\'' + emp.id + '\', ' + idx + ')">' +
						shift.start + ' - ' + shift.end + '</div></td>';
				} else {
					return '<td style="padding: 8px; text-align: center; border: 1px solid #e2e8f0; background: #fafafa; cursor: pointer;" onclick="addShift(\'' + emp.id + '\', ' + idx + ', \'' + day + '\')"><span style="color: #cbd5e1; font-size: 20px;">+</span></td>';
				}
			}).join('') +
			'</tr>';
	}).join('');
}

// Add employee
function openAddEmployeeModal() {
	const name = prompt('Employee Name:');
	if (!name) return;
	const role = prompt('Role (e.g., Manager, Server, Cook):');
	if (!role) return;

	const colors = ['#a855f7', '#3b82f6', '#f97316', '#10b981', '#ec4899', '#eab308'];
	const color = colors[scheduleData.employees.length % colors.length];

	const employee = {
		id: 'emp-' + Date.now(),
		name: name,
		role: role,
		color: color
	};

	scheduleData.employees.push(employee);
	scheduleData.shifts[employee.id] = {};
	saveScheduleData();
}

// Delete employee
function deleteEmployee(empId) {
	if (!confirm('Delete this employee?')) return;
	scheduleData.employees = scheduleData.employees.filter(e => e.id !== empId);
	delete scheduleData.shifts[empId];
	saveScheduleData();
}

// Add shift
function addShift(empId, dayIdx, dayName) {
	const start = prompt('Start time for ' + dayName + ' (e.g., 09:00):', '09:00');
	if (!start) return;
	const end = prompt('End time for ' + dayName + ' (e.g., 17:00):', '17:00');
	if (!end) return;

	if (!scheduleData.shifts[empId]) {
		scheduleData.shifts[empId] = {};
	}
	scheduleData.shifts[empId][dayIdx] = { start: start, end: end };
	saveScheduleData();
}

// Edit shift
function editShift(empId, dayIdx) {
	const shift = scheduleData.shifts[empId][dayIdx];
	const action = confirm('Delete this shift? (Cancel to edit)');

	if (action) {
		delete scheduleData.shifts[empId][dayIdx];
		saveScheduleData();
	} else {
		const start = prompt('Start time:', shift.start);
		if (start === null) return;
		const end = prompt('End time:', shift.end);
		if (end === null) return;

		scheduleData.shifts[empId][dayIdx] = { start: start, end: end };
		saveScheduleData();
	}
}

// Clear all data
function clearAllData() {
	if (!confirm('Clear all schedule data? This cannot be undone.')) return;
	scheduleData = { employees: [], shifts: {} };
	saveScheduleData();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', loadScheduleData);
