import mongoose from "mongoose";

const teamSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.Number,
    required: true,
    unique: true,
  },
  name: {
    type: mongoose.Schema.Types.String,
    required: true,
    unique: true,
  },
  nyes: {
    type: mongoose.Schema.Types.Number,
    required: true,
    default: 0,
  },
  nno: {
    type: mongoose.Schema.Types.Number,
    required: true,
    default: 0,
  },
  score: {
    type: mongoose.Schema.Types.Number,
    required: true,
    default: 0,
  },
});

const Team = mongoose.model("teams", teamSchema);
export default Team;
