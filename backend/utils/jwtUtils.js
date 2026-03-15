// utils/jwtUtils.js
const jwt = require("jsonwebtoken");

/**
 * Generate a signed JWT token.
 * @param {Object} payload - Data to embed (userId, role, institutionId, etc.)
 * @param {String} expiresIn  - e.g. '1d', '4h', '15m'
 * @returns {String} Signed JWT
 */
const generateToken = (payload, expiresIn = "1d") => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        algorithm: "HS256",   // Explicitly set — prevents algorithm confusion
        expiresIn,
    });
};

/**
 * Verify a JWT token.
 * Throws if expired, tampered, or using a different algorithm.
 * @param {String} token
 * @returns {Object} Decoded payload
 */
const verifyToken = (token) => {
    // FIX: Pass explicit algorithms array so tokens signed with
    // "alg: none" or RS256 (key confusion attack) are rejected outright.
    return jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ["HS256"],
    });
};

module.exports = { generateToken, verifyToken };
