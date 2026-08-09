// Middleware: checks or prepares a request before its controller runs.
const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Strict rate limiter for login/register (5 attempts per 15 minutes)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many login attempts, please try again after 15 minutes.',
    skipSuccessfulRequests: true, // Don't count successful requests
    keyGenerator: (req, res) => {
        // Use email as additional identifier to prevent bypass
        return req.body?.email ? `${req.ip}-${req.body.email}` : req.ip;
    }
});

module.exports = { apiLimiter, authLimiter };
