/**
 * Phone number utilities for SMS handling
 */

/**
 * Normalize phone number to E.164 format
 * @param {string} phone - Raw phone number
 * @returns {string} - Normalized phone number in E.164 format (+1xxxxxxxxxx)
 */
function normalizePhoneNumber(phone) {
    if (!phone) return null;
    
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Handle different formats
    if (digits.length === 10) {
        // US number without country code
        return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
        // US number with country code
        return `+${digits}`;
    } else if (digits.length > 11) {
        // International number, assume it has country code
        return `+${digits}`;
    } else if (digits.length < 10) {
        // Invalid length
        return null;
    }
    
    // Default case - assume US number
    return `+1${digits}`;
}

/**
 * Get normalized phone number for database storage (10 digits, no country code)
 * @param {string} phone - Raw phone number
 * @returns {string} - Normalized 10-digit phone number for DB storage
 */
function getDbPhoneNumber(phone) {
    if (!phone) return null;
    
    const digits = phone.replace(/\D/g, '');
    
    // Remove US country code if present
    if (digits.length === 11 && digits.startsWith('1')) {
        return digits.substring(1);
    } else if (digits.length === 10) {
        return digits;
    }
    
    return null; // Invalid format for US numbers
}

/**
 * Format phone number for display
 * @param {string} phone - Phone number
 * @returns {string} - Formatted phone number for display
 */
function formatPhoneForDisplay(phone) {
    if (!phone) return '';
    
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length === 10) {
        return `(${digits.substr(0, 3)}) ${digits.substr(3, 3)}-${digits.substr(6, 4)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
        const tenDigit = digits.substring(1);
        return `+1 (${tenDigit.substr(0, 3)}) ${tenDigit.substr(3, 3)}-${tenDigit.substr(6, 4)}`;
    }
    
    return phone; // Return original if we can't format it
}

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {Object} - Validation result
 */
function validatePhoneNumber(phone) {
    if (!phone) {
        return { valid: false, error: 'Phone number is required' };
    }
    
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length < 7) {
        return { valid: false, error: 'Phone number must be at least 7 digits' };
    }
    
    if (digits.length < 10) {
        return { valid: false, error: 'US phone numbers must be at least 10 digits' };
    }
    
    if (digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))) {
        return { valid: true, normalized: normalizePhoneNumber(phone) };
    }
    
    // For international numbers, be more lenient
    if (digits.length > 11) {
        return { valid: true, normalized: normalizePhoneNumber(phone) };
    }
    
    return { valid: false, error: 'Invalid phone number format' };
}

/**
 * Check if two phone numbers are the same
 * @param {string} phone1 - First phone number
 * @param {string} phone2 - Second phone number
 * @returns {boolean} - True if numbers are the same
 */
function arePhoneNumbersEqual(phone1, phone2) {
    const normalized1 = normalizePhoneNumber(phone1);
    const normalized2 = normalizePhoneNumber(phone2);
    return normalized1 === normalized2;
}

module.exports = {
    normalizePhoneNumber,
    getDbPhoneNumber,
    formatPhoneForDisplay,
    validatePhoneNumber,
    arePhoneNumbersEqual
};