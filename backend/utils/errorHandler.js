// utils/errorHandler.js
// Centralized error handler — replaces all inline res.status(500).json({ error: error.message })
// Usage: add as the LAST middleware in server.js after all routes

/**
 * Determine if the error is a known/operational error we want to surface
 * (e.g. validation errors, 404s) vs an unexpected crash.
 */
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true; // Safe to expose to client
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Global Express error handler middleware.
 * Must have 4 arguments (err, req, res, next) to be treated as an error handler.
 */
const globalErrorHandler = (err, req, res, next) => {
    const isDev = process.env.NODE_ENV !== "production";

    // Always log the full error server-side
    console.error(`[${new Date().toISOString()}] ERROR ${req.method} ${req.url}:`, {
        message: err.message,
        stack: isDev ? err.stack : "[hidden in production]",
        code: err.code,
    });

    // Determine HTTP status code
    const statusCode = err.statusCode || err.status || 500;

    // Build the response sent to the CLIENT
    if (isDev) {
        // Development: show full error details to help debugging
        return res.status(statusCode).json({
            success: false,
            message: err.message || "Something went wrong",
            stack: err.stack,
            code: err.code,
        });
    } else {
        // Production: only expose details for known operational errors
        if (err.isOperational) {
            return res.status(statusCode).json({
                success: false,
                message: err.message,
            });
        }

        // Unknown/unexpected error — never expose internals
        return res.status(500).json({
            success: false,
            message: "Something went wrong. Please try again later.",
        });
    }
};

/**
 * Helper used in routes to wrap async handlers and forward errors to globalErrorHandler.
 * Usage: router.get("/path", catchAsync(async (req, res) => { ... }));
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = { AppError, globalErrorHandler, catchAsync };
