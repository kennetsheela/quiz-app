// controllers/authController.js
const User = require("../models/User");
const { generateToken } = require("../utils/jwtUtils");

// Helper: determine cookie options based on environment
const cookieOptions = () => ({
    httpOnly: true,   // Cannot be accessed by JavaScript — prevents XSS token theft
    secure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
    sameSite: "Strict", // Prevents CSRF
    maxAge: 24 * 60 * 60 * 1000, // 24 hours in ms (matches JWT expiry)
    path: "/",
});

/**
 * Login for Institution Admin / HOD
 * FIX: Token is now set as an HttpOnly cookie in addition to being in the response body.
 * The frontend should prefer the cookie; the body token is kept for backward compatibility
 * during the migration period, then can be removed.
 */
const institutionLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const user = await User.findOne({
            email: email.toLowerCase(),
            role: { $in: ["inst-admin", "hod"] }
        });

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const role = user.role === "inst-admin" ? "institutionAdmin" : "hod";
        const token = generateToken({
            userId: user._id,
            id: user._id,
            uid: user.firebaseUid || user._id.toString(),
            role,
            institutionId: user.institutionId,
            hodDepartmentId: user.hodDepartmentId
        }, process.env.JWT_EXPIRES_IN || "1d");

        // FIX: Set token as HttpOnly cookie — this is the secure transport mechanism.
        // The browser will send this cookie automatically on every subsequent request.
        res.cookie("token", token, cookieOptions());

        res.json({
            message: "Login successful",
            // Returning the token in body too during migration — remove once frontend
            // is fully migrated to cookie-based auth (credentials: 'include')
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role,
                institutionId: user.institutionId
            }
        });
    } catch (error) {
        console.error("Institution login error:", error);
        res.status(500).json({ error: "Server error during login" });
    }
};

/**
 * Login for Student
 */
const studentLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const user = await User.findOne({ email: email.toLowerCase(), role: "student" });

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = generateToken({
            userId: user._id,
            id: user._id,
            uid: user.firebaseUid || user._id.toString(),
            role: "student",
            institutionId: user.institutionId
        }, process.env.STUDENT_JWT_EXPIRES_IN || "4h");

        // Set shorter-lived cookie for students
        res.cookie("token", token, {
            ...cookieOptions(),
            maxAge: 4 * 60 * 60 * 1000, // 4 hours
        });

        res.json({
            message: "Login successful",
            token, // Keep in body during migration period
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: "student",
                institutionId: user.institutionId,
                batchId: user.batchId
            }
        });
    } catch (error) {
        console.error("Student login error:", error);
        res.status(500).json({ error: "Server error during login" });
    }
};

/**
 * Logout — clears the HttpOnly cookie server-side
 */
const logout = (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
        sameSite: "Strict",
        path: "/",
    });
    res.json({ message: "Logged out successfully" });
};

module.exports = { institutionLogin, studentLogin, logout };
