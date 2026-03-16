import cors from "cors";
import express from "express";
import morgan from "morgan";
import { connectToDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { requireAdminAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";

const app = express();

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true
  })
);
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Bus Vara API is running"
  });
});

app.use("/api", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", requireAdminAuth, adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  try {
    await connectToDatabase();
    app.listen(env.PORT, () => {
      console.log(`API listening on http://localhost:${env.PORT}`);
    });
  } catch (error) {
    console.error("API startup failed", error);
    process.exit(1);
  }
}

bootstrap();
