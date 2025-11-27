import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username and password required" });
  }

  const filePath = path.join(process.cwd(), "data", "users.json");

  let users = {};
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf8");
    users = JSON.parse(content);
  }

  const user = users[username];
  if (!user) {
    return res.status(401).json({ success: false, message: "Invalid username or password" });
  }

  const valid = await bcrypt.compare(password, user.password_hash || "");
  if (!valid) {
    return res.status(401).json({ success: false, message: "Invalid username or password" });
  }

  // Optional: Add session or token logic here if needed
  return res.status(200).json({ success: true, message: "Login successful" });
}
