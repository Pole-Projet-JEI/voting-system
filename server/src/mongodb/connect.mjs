import mongoose from "mongoose";

export default async function dbconfig(connectionString) {
  await mongoose
    .connect(`${connectionString}`, {
      serverSelectionTimeoutMS: 5000,
      directConnection: true,
      maxPoolSize: 50, 
      minPoolSize: 10,
      retryWrites: true, 
      retryReads: true,
    })
    .then(() => console.log("connected to db"))
    .catch((err) => console.log(err));
}