import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootEnvPath = path.resolve(__dirname, "../../../../.env");
const apiEnvPath = path.resolve(__dirname, "../../.env");

// Load root env first, then API env so API-specific values always win.
dotenv.config({ path: rootEnvPath });
dotenv.config({ path: apiEnvPath, override: true });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().url().default("http://localhost:3000"),
  MONGODB_URI: z.string().min(1),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(12),
  JWT_SECRET: z.string().min(24),
  JWT_EXPIRES_IN: z.string().default("12h"),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD_HASH: z.string().min(40)
});

export const env = envSchema.parse(process.env);
