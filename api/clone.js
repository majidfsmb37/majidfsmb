// api/clone.js
import fs from 'fs';
import path from 'path';
import { parse } from 'formidable';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const config = {
  api: { bodyParser: false }, // we handle parsing manually
};

export default async function handler(req) {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Only POST allowed' }), { status: 405 });

  const form = new parse.IncomingForm();
  form.uploadDir = path.join(process.cwd(), 'uploads');
  form.keepExtensions = true;
  if (!fs.existsSync(form.uploadDir)) fs.mkdirSync(form.uploadDir, { recursive: true });

  const data = await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });

  const username = data.fields.username;
  if (!username) return new Response(JSON.stringify({ error: 'No user' }), { status: 400 });

  const name = (data.fields.clone_name || '').trim();
  if (!name) return new Response(JSON.stringify({ error: 'Name required' }), { status: 400 });

  const file = data.files.clone_file;
  if (!file || !file.filepath) return new Response(JSON.stringify({ error: 'No file uploaded' }), { status: 400 });

  const ext = path.extname(file.originalFilename || '').slice(1).toLowerCase();
  const allowedExt = ['mp3', 'mpeg', 'mpg', 'mp4'];
  if (!allowedExt.includes(ext)) return new Response(JSON.stringify({ error: `Unsupported file type: .${ext}` }), { status: 400 });

  // Step 1: Move file to uploads
  const tempFile = path.join(form.uploadDir, `temp_${file.originalFilename}`);
  fs.renameSync(file.filepath, tempFile);

  // Step 2: Convert to MP3 if needed
  let targetPath = path.join(form.uploadDir, `clone_${Date.now()}.mp3`);
  if (ext !== 'mp3') {
    try {
      await execAsync(`ffmpeg -y -i ${JSON.stringify(tempFile)} -vn -ar 44100 -ac 2 -b:a 192k ${JSON.stringify(targetPath)}`);
      fs.unlinkSync(tempFile);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Conversion failed', details: e.message }), { status: 500 });
    }
  } else {
    targetPath = path.join(form.uploadDir, `clone_${Date.now()}.mp3`);
    fs.renameSync(tempFile, targetPath);
  }

  // Step 3: Save info in clones.json
  const clonesFile = path.join(process.cwd(), 'clones.json');
  const clones = fs.existsSync(clonesFile) ? JSON.parse(fs.readFileSync(clonesFile, 'utf-8')) : {};
  if (!clones[username]) clones[username] = [];
  clones[username].push({
    name,
    file: path.basename(targetPath),
    date: new Date().toISOString(),
  });
  fs.writeFileSync(clonesFile, JSON.stringify(clones, null, 2));

  return new Response(JSON.stringify({ success: true, message: `Voice '${name}' cloned successfully as MP3`, file: path.basename(targetPath) }), { status: 200 });
}
