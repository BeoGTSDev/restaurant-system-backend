const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Create write stream for access log
const accessLogStream = fs.createWriteStream(
    path.join(logsDir, 'access.log'),
    { flags: 'a' }
);

// Custom morgan format
const morganFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';

// Morgan middleware for logging
const requestLogger = morgan(morganFormat, { stream: accessLogStream });

// Also log to console in development
if (process.env.NODE_ENV !== 'production') {
    morgan.token('colorize', (req, res) => {
        const status = res.statusCode;
        let color = '\x1b[32m'; // Green for success
        if (status >= 400 && status < 500) color = '\x1b[33m'; // Yellow for client error
        if (status >= 500) color = '\x1b[31m'; // Red for server error
        return `${color}${status}\x1b[0m`;
    });

    const consoleFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :colorize :res[content-length] ":referrer" ":user-agent" :response-time ms';
    const consoleLogger = morgan(consoleFormat);

    module.exports = [consoleLogger, requestLogger];
} else {
    module.exports = requestLogger;
}
