import mongoose from "mongoose";
import { env } from "./env.js";

let isConnected = false;

export async function connectToDatabase() {
  if (isConnected) {
    return mongoose.connection;
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI);
  isConnected = true;

  return mongoose.connection;
}
