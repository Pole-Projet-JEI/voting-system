import mongoose from "mongoose";

const adminTokenRevocationSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

const AdminTokenRevocation = mongoose.model(
  "adminTokenRevocations",
  adminTokenRevocationSchema
);

export default AdminTokenRevocation;
