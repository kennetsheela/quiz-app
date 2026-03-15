const { verifyToken } = require("../utils/jwtUtils");
const admin = require("firebase-admin");
const User = require("../models/User");

/**
 * Global authentication middleware
 * Supports both custom JWTs and Firebase ID tokens for backward compatibility
 */
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        console.log("[AuthMiddleware] Received authorization header:", authHeader ? authHeader.substring(0, 20) + "..." : "NONE");

        if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] === "null" || authHeader.split(" ")[1] === "undefined") {
            return res.status(401).json({ error: "No token provided. Authorization denied." });
        }

        const token = authHeader.split(" ")[1];

        // 1. Try verifying as local JWT
        try {
            const decoded = verifyToken(token);
            req.user = decoded;
            // console.log(`[Auth] JWT Verified: ${req.user.email || req.user.id} (${req.user.role})`);
            return next();
        } catch (jwtError) {
            // Not a valid inner JWT or expired. Try Firebase fallback.
            if (jwtError.name === "TokenExpiredError") {
                return res.status(401).json({ error: "Token expired. Please login again." });
            }

            // 2. Try verifying as Firebase token
            try {
                const firebaseUser = await admin.auth().verifyIdToken(token);

                // Fetch user from DB to get role and institutionId
                const user = await User.findOne({ firebaseUid: firebaseUser.uid });

                // FIX: If user not found in DB, we still allow the request to proceed
                // but with a restricted req.user object. This allows registration
                // flows to work for new users who don't have a DB record yet.
                if (!user) {
                    req.user = {
                        uid: firebaseUser.uid,
                        email: firebaseUser.email,
                        role: null, // No role yet
                        isNewUser: true
                    };
                    return next();
                }

                req.user = {
                    userId: user._id,
                    id: user._id,
                    uid: firebaseUser.uid,
                    role: user.role === "inst-admin" ? "institutionAdmin" : (user.role === "hod" ? "hod" : user.role),
                    institutionId: user.institutionId?._id || user.institutionId,
                    email: firebaseUser.email,
                    hodDepartmentId: user.hodDepartmentId
                };
                // console.log(`[Auth] Firebase Verified: ${req.user.email} (${req.user.role})`);
                return next();
            } catch (firebaseError) {
                // Log full error server-side only — never expose error codes to client
                console.warn("Auth failed for both JWT and Firebase:", firebaseError.code, firebaseError.message);
                const isExpired = firebaseError.code === 'auth/id-token-expired';
                return res.status(401).json({
                    // FIX: Removed 'code' field — Firebase error codes leak internal details
                    error: isExpired ? "Token expired. Please login again." : "Invalid token. Authorization denied."
                });
            }
        }
    } catch (error) {
        console.error("Auth middleware error:", error);
        res.status(500).json({ error: "Server error during authentication" });
    }
};

/**
 * Role-based authorization middleware
 * @param {Array<String>} roles - Allowed roles
 */
const allowRoles = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            console.warn(`[Role] Access denied for ${req.user?.email || 'unknown'}. Role ${req.user?.role} not in [${roles.join(", ")}]`);
            return res.status(403).json({
                error: `Access denied. ${roles.join(" or ")} role required.`
            });
        }

        // Compatibility layer: set req.instAdmin and req.staff for legacy routes
        if (req.user.role === "institutionAdmin") {
            req.instAdmin = req.user;
        }
        if (["institutionAdmin", "hod"].includes(req.user.role)) {
            req.staff = req.user;
        }

        next();
    };
};

/**
 * Institution Isolation - Ensures user only accesses data from their own institution
 */
const isolateInstitution = (req, res, next) => {
    // Try to find institution ID in various parts of the request
    const institutionId = req.params.institutionId || req.params.id || req.params.instId || req.body.institutionId || req.query.institutionId;

    if (!institutionId) {
        return next();
    }

    if (!req.user) {
        return res.status(401).json({ error: "User not authenticated for isolation check." });
    }

    // Super Admin can bypass all isolation
    if (req.user.role === "super-admin") {
        return next();
    }

    // Standardize comparison as strings
    const userInstId = req.user.institutionId ? req.user.institutionId.toString() : null;
    const targetInstId = institutionId.toString();

    if (userInstId !== targetInstId) {
        console.warn(`[Isolation] Access denied for user ${req.user.email || req.user.id}. User Institutional ID: ${userInstId}, Target ID: ${targetInstId}`);
        return res.status(403).json({
            status: "forbidden",
            error: "Access denied. You can only access data from your own institution."
        });
    }

    next();
};

module.exports = {
    authenticate,
    allowRoles,
    isolateInstitution,
};
