import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export async function validateAdminCredentials({ email, password }) {
  if (!email || !password) {
    return false;
  }

  if (email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) {
    return false;
  }

  return bcrypt.compare(password, env.ADMIN_PASSWORD_HASH);
}

export function createAdminToken() {
  return jwt.sign(
    {
      email: env.ADMIN_EMAIL,
      role: "admin"
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN,
      subject: env.ADMIN_EMAIL
    }
  );
}

export function verifyAdminToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}
