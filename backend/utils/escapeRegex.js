// utils/escapeRegex.js
// Prevents ReDoS (Regular Expression Denial of Service) attacks by escaping
// all special regex metacharacters in user-supplied or DB-sourced strings
// before they are used in `new RegExp()`.

/**
 * Escapes special regex metacharacters in a string.
 * @param {string} str - The raw input string (user-supplied or DB value)
 * @returns {string} - Safe string for use inside new RegExp()
 */
function escapeRegex(str) {
    if (typeof str !== "string") return "";
    // Escape: . * + ? ^ $ { } ( ) | [ ] \
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a safe, case-insensitive exact-match regex from a string.
 * Example: safeExactRegex("CSE Dept.") => /^CSE\ Dept\.$/i
 * @param {string} str
 * @returns {RegExp}
 */
function safeExactRegex(str) {
    if (typeof str !== "string" || str.trim().length === 0) return null;
    const MAX_LENGTH = 200;
    const trimmed = str.trim().slice(0, MAX_LENGTH);
    return new RegExp(`^${escapeRegex(trimmed)}$`, "i");
}

/**
 * Build a safe, case-insensitive partial-match (LIKE) regex.
 * Use this for search fields instead of raw new RegExp(userInput).
 * @param {string} str
 * @returns {RegExp}
 */
function safeSearchRegex(str) {
    if (typeof str !== "string" || str.trim().length === 0) return null;
    const MAX_LENGTH = 100;
    const trimmed = str.trim().slice(0, MAX_LENGTH);
    return new RegExp(escapeRegex(trimmed), "i");
}

module.exports = { escapeRegex, safeExactRegex, safeSearchRegex };
