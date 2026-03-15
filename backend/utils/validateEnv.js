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
    "FIREBASE_SERVICE_ACCOUNT",
    "PORT",
];

const MIN_JWT_SECRET_LENGTH = 32; // 256 bits minimum
const MIN_ADMIN_PASSWORD_LENGTH = 12;

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

    // 5. Warn if running in production with development-mode settings
    if (process.env.NODE_ENV === "production") {
        if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
            warnings.push(
                `⚠️  FIREBASE_SERVICE_ACCOUNT not set. Falling back to file-based service account — not recommended for production.`
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
