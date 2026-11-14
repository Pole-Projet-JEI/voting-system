import "dotenv/config";
import crypto from "node:crypto";

const getPepper = () => {
  const pepper = process.env.VOTER_CODE_PEPPER;

  if (!pepper) {
    throw new Error("VOTER_CODE_PEPPER must be configured");
  }

  return pepper;
};

export const hashVoterCode = (code) =>
  crypto.createHmac("sha256", getPepper()).update(code).digest("hex");
