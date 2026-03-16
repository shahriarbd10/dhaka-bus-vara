import express from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAdminAuth } from "../middleware/auth.js";
import { createAdminToken, validateAdminCredentials } from "../services/authService.js";

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid login payload"
    });
  }

  const isValid = await validateAdminCredentials(parsed.data);

  if (!isValid) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password"
    });
  }

  const token = createAdminToken();

  return res.json({
    success: true,
    token,
    expiresIn: env.JWT_EXPIRES_IN,
    admin: {
      email: env.ADMIN_EMAIL,
      role: "admin"
    }
  });
});

router.get("/me", requireAdminAuth, async (req, res) => {
  return res.json({
    success: true,
    admin: {
      email: req.admin.email,
      role: req.admin.role
    }
  });
});

export default router;
