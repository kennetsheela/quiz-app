// utils/validateEnv.js
// Validates required environment variables at app startup.
// Call this BEFORE any other initialization in server.js.
// The app will refuse to start if critical env vars are missing or too weak.

const REQUIRED_VARS = [
    "MONGO_URI",
    "JWT_SECRET",
    "SUPER_ADMIN_USERNAME",
    "SUPER_ADMIN_PASSWORD",
    "NODE_ENV",
];

// Optional but warn if missing
const RECOMMENDED_VARS = [
    "PORT",
];

const MIN_JWT_SECRET_LENGTH = 32; // 256 bits minimum
const MIN_ADMIN_PASSWORD_LENGTH = 12;

function hasFirebaseCredentials() {
    // Option 1: individual env vars (new preferred method)
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        return true;
    }
    // Option 2: Base64 encoded JSON (or split parts)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) return true;
    if (process.env.FIREBASE_PRIVATE_KEY_B64_1 && process.env.FIREBASE_PRIVATE_KEY_B64_2) return true;
    // Option 3: raw JSON string
    if (process.env.FIREBASE_SERVICE_ACCOUNT) return true;
    // Option 4: file path (dev only)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) return true;
    return false;
}

function validateEnv() {
    const errors = [];
    const warnings = [];

    // 1. Check required vars exist
    for (const varName of REQUIRED_VARS) {
        if (!process.env[varName]) {
            errors.push(`❌ Missing required env var: ${varName}`);
        }
    }

    // 2. Check for weak JWT secret
    if (process.env.JWT_SECRET) {
        const secret = process.env.JWT_SECRET;

        // Reject obvious placeholder values
        const KNOWN_WEAK = [
            "your_super_secret_jwt_key_here_12345",
            "secret",
            "jwt_secret",
            "mysecret",
            "changeme",
        ];

        if (KNOWN_WEAK.some(w => secret.toLowerCase().includes(w))) {
            errors.push(
                `❌ JWT_SECRET appears to be a placeholder value. Generate a secure secret:\n` +
                `   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
            );
        } else if (secret.length < MIN_JWT_SECRET_LENGTH) {
            errors.push(
                `❌ JWT_SECRET is too short (${secret.length} chars). Minimum: ${MIN_JWT_SECRET_LENGTH} chars.`
            );
        }
    }

    // 3. Check super admin password strength
    if (process.env.SUPER_ADMIN_PASSWORD) {
        const pwd = process.env.SUPER_ADMIN_PASSWORD;
        if (pwd.length < MIN_ADMIN_PASSWORD_LENGTH) {
            errors.push(
                `❌ SUPER_ADMIN_PASSWORD is too short (${pwd.length} chars). Minimum: ${MIN_ADMIN_PASSWORD_LENGTH} chars.`
            );
        }
        if (pwd === "123" || pwd === "admin" || pwd === "password" || pwd === "superadmin") {
            errors.push(`❌ SUPER_ADMIN_PASSWORD is a trivially guessable value. Change it immediately.`);
        }
    }

    // 4. Check recommended vars
    for (const varName of RECOMMENDED_VARS) {
        if (!process.env[varName]) {
            warnings.push(`⚠️  Missing recommended env var: ${varName}`);
        }
    }

    // 5. Warn if running in production with no Firebase credentials configured at all
    if (process.env.NODE_ENV === "production") {
        if (!hasFirebaseCredentials()) {
            const missing = [];
            if (!process.env.FIREBASE_PROJECT_ID) missing.push("FIREBASE_PROJECT_ID");
            if (!process.env.FIREBASE_CLIENT_EMAIL) missing.push("FIREBASE_CLIENT_EMAIL");
            if (!process.env.FIREBASE_PRIVATE_KEY && 
                !process.env.FIREBASE_PRIVATE_KEY_BASE64 && 
                !(process.env.FIREBASE_PRIVATE_KEY_B64_1 && process.env.FIREBASE_PRIVATE_KEY_B64_2)) {
                missing.push("FIREBASE_PRIVATE_KEY (raw, BASE64, or B64_1 through B64_4)");
            }
            
            warnings.push(
                `⚠️  Firebase credentials incomplete: Missing [${missing.join(", ")}]. Auth features will fail.`
            );
        }
    }

    // Print warnings (non-fatal)
    if (warnings.length > 0) {
        console.warn("\n🔶 Environment Warnings:");
        warnings.forEach(w => console.warn(`   ${w}`));
    }

    // Print errors and exit if fatal
    if (errors.length > 0) {
        console.error("\n🚨 Environment Validation FAILED — App cannot start:");
        errors.forEach(e => console.error(`   ${e}`));
        console.error("\nFix the above issues in your .env file and restart.\n");
        process.exit(1);
    }

    console.log("✅ Environment validation passed.");
}

module.exports = validateEnv;
