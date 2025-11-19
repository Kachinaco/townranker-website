/**
 * @typedef {Object} Employee
 * @property {string} id - Unique employee identifier
 * @property {string} name - Employee full name
 * @property {string} role - Employee role (e.g., "Manager", "Server", "Cook")
 * @property {string} avatar - URL to employee avatar image
 */

/**
 * @typedef {Object} Shift
 * @property {string} id - Unique shift identifier
 * @property {string} employeeId - Reference to employee ID
 * @property {string} employeeName - Employee name (denormalized for convenience)
 * @property {string} date - Shift date in YYYY-MM-DD format
 * @property {string} startTime - Start time in HH:mm format
 * @property {string} endTime - End time in HH:mm format
 * @property {string} role - Role for this shift
 */

export const ROLE_COLORS = {
  'Manager': 'bg-purple-500',
  'Server': 'bg-blue-500',
  'Cook': 'bg-orange-500',
  'Bartender': 'bg-green-500',
  'Host': 'bg-pink-500',
  'Busser': 'bg-yellow-500',
  'Default': 'bg-slate-500'
};

export const HOURLY_RATES = {
  'Manager': 25,
  'Server': 12,
  'Cook': 18,
  'Bartender': 15,
  'Host': 13,
  'Busser': 11,
  'Default': 15
};
