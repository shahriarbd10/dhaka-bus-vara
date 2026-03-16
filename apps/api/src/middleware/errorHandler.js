import { env } from "../config/env.js";

export function errorHandler(error, req, res, next) {
  const uploadTooLarge = error?.code === "LIMIT_FILE_SIZE";
  const status = uploadTooLarge ? 400 : error.statusCode || 500;
  const message = uploadTooLarge
    ? `Uploaded file is too large. Limit: ${env.MAX_UPLOAD_SIZE_MB}MB`
    : error.message || "Internal server error";

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== "production" ? { stack: error.stack } : {})
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
}

export function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function getUploadLimitBytes() {
  return env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
}
