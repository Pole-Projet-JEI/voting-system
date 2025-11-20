import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    teamName: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    description: {
      type: String,
      default: "",
    },
    nyes: {
      type: Number,
      required: true,
      default: 0,
    },
    nno: {
      type: Number,
      required: true,
      default: 0,
    },
    presented: {
      type: Boolean,
      default: false, 
    },
    presenting: {
      type: Boolean,
      default: false,
    },
    presentedAt: {
      type: Date,
      default: null, // when was this team presented? we need it
    },
  },
  {
    timestamps: true, // Auto-adds createdAt and updatedAt
  }
);

// Create a unique partial index on 'presenting'
// Only documents with presenting: true will be indexed
// This ensures max 1 document can have presenting: true
teamSchema.index(
  { presenting: 1 },
  {
    unique: true,
    partialFilterExpression: { presenting: true },
  }
);

const Team = mongoose.model("teams", teamSchema);
export default Team;
