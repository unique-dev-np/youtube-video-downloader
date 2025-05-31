const rateLimit = require("express-rate-limit");
const config = require("../config/config");

const createRateLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || config.rateLimit.windowMs,
    max: options.max || config.rateLimit.max,
    message: {
      error: "Too many requests, please try again later.",
      retryAfter: Math.ceil(options.windowMs / 1000 / 60) || 15,
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = {
  general: createRateLimiter(),
  download: createRateLimiter({ max: 10, windowMs: 10 * 60 * 1000 }), // 10 downloads per 10 minutes
  info: createRateLimiter({ max: 50, windowMs: 10 * 60 * 1000 }), // 50 info requests per 10 minutes
};
