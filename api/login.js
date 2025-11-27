import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const usersFile = path.join(process.cwd(), 'data', 'users.json');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const usersData = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile)) : {};

  if (!usersData[username] || !usersData[username].password_hash) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const valid = await bcrypt.compare(password, usersData[username].password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

  // Login ok, generate session token
  const token = Math.random().toString(36).substring(2, 15);
  usersData[username].lastToken = token;
  fs.writeFileSync(usersFile, JSON.stringify(usersData, null, 2));

  res.status(200).json({ success: true, token });
}
