import fs from 'fs';
import path from 'path';

const usersFile = path.join(process.cwd(), 'data', 'users.json');

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  const usersData = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile)) : {};
  if (usersData[username]) {
    delete usersData[username].lastToken;
    fs.writeFileSync(usersFile, JSON.stringify(usersData, null, 2));
  }

  res.status(200).json({ success: true });
}
