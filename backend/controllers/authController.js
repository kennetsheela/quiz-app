const User = require("../models/User");
const { generateToken } = require("../utils/jwtUtils");

/**
 * Login for Institution Admin
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
            return res.status(401).json({ error: "Invalid credentials or unauthorized role" });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Generate JWT
        const role = user.role === "inst-admin" ? "institutionAdmin" : "hod";
        const token = generateToken({
            userId: user._id,
            id: user._id, // compatibility
            uid: user.firebaseUid || user._id.toString(), // compatibility with req.user.uid
            role: role,
            institutionId: user.institutionId,
            hodDepartmentId: user.hodDepartmentId // for HODs
        }, "1d");

        res.json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: role,
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
            return res.status(401).json({ error: "Invalid credentials or role" });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Generate JWT
        const token = generateToken({
            userId: user._id,
            id: user._id, // compatibility
            uid: user.firebaseUid || user._id.toString(), // compatibility with req.user.uid
            role: "student",
            institutionId: user.institutionId
        }, "4h");

        res.json({
            message: "Login successful",
            token,
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

module.exports = {
    institutionLogin,
    studentLogin
};
