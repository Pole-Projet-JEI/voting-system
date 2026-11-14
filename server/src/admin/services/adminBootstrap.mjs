import Admin from "../../mongodb/adminSchema.mjs";
import { hashAdminPassword } from "./authService.mjs";

export async function ensureBootstrapAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0 && !process.env.ADMIN_SECRET_KEY) {
      throw new Error(
        "Configure ADMIN_USERNAME and ADMIN_PASSWORD for the first admin"
      );
    }
    return;
  }

  const existingAdmin = await Admin.findOne({ username });
  if (existingAdmin) {
    return;
  }

  await Admin.create({
    username,
    passwordHash: await hashAdminPassword(password),
    mustChangePassword: true,
  });

  console.log(`Created bootstrap admin account "${username}"`);
}
