// utils/helpers.js

/**
 * Format error response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Formatted error object
 */
exports.formatError = (message, statusCode = 500) => {
  return {
    error: {
      message,
      status: statusCode
    }
  };
};

/**
 * Format success response
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Formatted success object
 */
exports.formatSuccess = (data, message = 'Success', statusCode = 200) => {
  return {
    data,
    message,
    status: statusCode
  };
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid, false otherwise
 */
exports.isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Check if password meets minimum requirements
 * @param {string} password - Password to validate
 * @returns {boolean} True if valid, false otherwise
 */
exports.isValidPassword = (password) => {
  // Minimum 8 characters, at least one letter and one number
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
  return passwordRegex.test(password);
};

/**
 * Filter sensitive data from object
 * @param {Object} obj - Object to filter
 * @param {Array} fields - Fields to remove
 * @returns {Object} Filtered object
 */
exports.filterSensitiveData = (obj, fields = ['password']) => {
  const filtered = { ...obj };
  fields.forEach(field => {
    if (filtered[field]) {
      delete filtered[field];
    }
  });
  return filtered;
};