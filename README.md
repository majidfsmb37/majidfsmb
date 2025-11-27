# FSMB AI Voice Generation Platform

A modern, serverless text-to-speech platform powered by Speechify API, deployed on Vercel.

## Features

✅ **Text to Speech Generation** - Convert text to high-quality speech using multiple voices
✅ **Voice Cloning** - Clone your own voice for personalized speech generation
✅ **Multiple API Key Support** - Automatic rotation between multiple Speechify API keys
✅ **localStorage Authentication** - Simple, client-side user management
✅ **Responsive Design** - Works on desktop, tablet, and mobile devices
✅ **Real-time Progress** - Live progress updates during voice generation
✅ **Character Tracking** - Track your usage across sessions

## Project Structure

```
fsmbaivoice-vercel/
├── index.html              # Main dashboard (frontend)
├── api/
│   ├── generate.js         # Voice generation endpoint
│   ├── clone.js            # Voice cloning endpoint
│   └── voices.js           # Available voices list
├── package.json            # Node.js dependencies
├── vercel.json             # Vercel configuration
└── README.md               # This file
```

## Deployment Instructions

### Step 1: Prepare Your Repository

1. Make sure you have all files in your local `fsmbaivoice` folder
2. Open terminal/command prompt and navigate to your project folder:
   ```bash
   cd /path/to/fsmbaivoice-vercel
   ```

### Step 2: Initialize Git (if not already done)

```bash
git init
git add .
git commit -m "Initial commit - FSMB AI Voice Platform"
```

### Step 3: Push to GitHub

1. Create a new repository on GitHub (https://github.com/new)
   - Name it: `fsmbaivoice` (or any name you prefer)
   - Keep it **Private** (recommended)
   - Don't initialize with README

2. Connect your local repository to GitHub:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/fsmbaivoice.git
   git branch -M main
   git push -u origin main
   ```

### Step 4: Deploy to Vercel

1. Go to https://vercel.com
2. Click "Import Project"
3. Select your GitHub repository: `fsmbaivoice`
4. Vercel will automatically detect the configuration
5. Click "Deploy"
6. Wait 1-2 minutes for deployment to complete

### Step 5: Access Your Website

After deployment, Vercel will give you a URL like:
```
https://fsmbaivoice.vercel.app
```

You can also add a custom domain in Vercel settings!

## How to Use

### First Time Setup

1. Open your deployed website
2. You'll see a login screen
3. Enter:
   - **Username**: Any name you want (e.g., "majid")
   - **API Keys**: Your Speechify API keys, separated by commas
     ```
     key1,key2,key3,key4,key5
     ```
4. Click "Login"

### Generating Voice

1. Select a voice from the right panel
2. Type or paste your text (up to 200,000 characters)
3. Adjust speed if needed (optional)
4. Click "Generate Speech"
5. Wait for generation to complete
6. Download your audio file

### Cloning Your Voice

1. Click "Voice Cloning" in the left menu
2. Enter a name for your voice
3. Upload a 10-30 second clear audio sample
4. Click "Upload & Clone"
5. Wait for processing (may take 1-2 minutes)
6. Your cloned voice will appear in the voice list

### Managing API Keys

1. Click "Settings" in the left menu
2. Update your API keys (comma-separated)
3. Click "Save Settings"

## Important Notes

### Limitations

⚠️ **Vercel Hobby Plan Limits:**
- Maximum 10 seconds execution time per request
- For very long texts (50+ minutes of audio), the generation may timeout
- If you need to generate very long audio, consider breaking it into smaller chunks

⚠️ **Data Storage:**
- All user data is stored in browser's localStorage
- Clearing browser data will delete your settings
- No server-side database (keeps it simple and free!)

### API Key Management

- Your API keys are stored locally in your browser
- They are sent to Vercel serverless functions for each request
- Never share your deployed URL with untrusted users
- Consider using Vercel's environment variables for production

### Performance Tips

1. **Use Multiple API Keys**: Add 5-10 Speechify API keys for better reliability
2. **Break Long Texts**: For texts longer than 10,000 characters, consider splitting
3. **Monitor Usage**: Keep track of your Speechify API usage limits

## Troubleshooting

### "404: NOT_FOUND" Error

This means Vercel is working, but can't find your files. Solution:
1. Make sure `index.html` is in the root directory
2. Redeploy from Vercel dashboard

### "Generation Failed" Error

Possible causes:
1. Invalid API key - Check your API keys in Settings
2. API rate limit - Wait a few minutes and try again
3. Network timeout - Try with shorter text

### Voice Cloning Not Working

1. Make sure audio file is 10-30 seconds
2. Use clear, high-quality audio (WAV or MP3)
3. Check that your API key has cloning permissions

## Updating Your Deployment

When you make changes to your code:

```bash
git add .
git commit -m "Description of changes"
git push
```

Vercel will automatically redeploy your site!

## Support

For issues or questions:
- Check Speechify API documentation: https://docs.speechify.com
- Vercel documentation: https://vercel.com/docs

## License

Private project - All rights reserved

---

**Made with ❤️ by FSMB Team**
