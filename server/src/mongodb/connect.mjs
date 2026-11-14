import mongoose from "mongoose";

export default async function dbconfig(connectionString) {
  if (!connectionString) {
    throw new Error("MONGO_URI must be configured");
  }

  await mongoose.connect(connectionString, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 60,
    minPoolSize: 10,
    retryWrites: true,
    retryReads: true,
  });

  console.log("Connected to MongoDB");
}