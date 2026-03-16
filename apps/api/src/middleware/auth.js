import { env } from "../config/env.js";
import { createHttpError } from "./errorHandler.js";
import { verifyAdminToken } from "../services/authService.js";

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function requireAdminAuth(req, res, next) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      throw createHttpError(401, "Missing admin access token");
    }

    const payload = verifyAdminToken(token);

    if (payload?.role !== "admin") {
      throw createHttpError(403, "Admin role required");
    }

    if (String(payload.email).toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) {
      throw createHttpError(403, "Token does not match configured admin");
    }

    req.admin = {
      email: payload.email,
      role: payload.role,
      sub: payload.sub
    };

    next();
  } catch (error) {
    const statusCode = error.statusCode || 401;
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 401 ? "Unauthorized" : error.message || "Forbidden"
    });
  }
}
