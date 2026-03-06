const jwt = require("jsonwebtoken");

/**
 * Generate a JWT token
 * @param {Object} payload - The payload to sign
 * @param {String} expiresIn - Expiry time (e.g., '1d', '4h')
 * @returns {String} - The signed JWT
 */
const generateToken = (payload, expiresIn = "1d") => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: expiresIn,
    });
};

/**
 * Verify a JWT token
 * @param {String} token - The token to verify
 * @returns {Object} - The decoded payload
 */
const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        throw error;
    }
};

module.exports = {
    generateToken,
    verifyToken,
};
