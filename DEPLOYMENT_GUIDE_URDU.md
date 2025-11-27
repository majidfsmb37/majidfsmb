# FSMB AI - Vercel پر ڈیپلائمنٹ کی مکمل گائیڈ

## مرحلہ 1: تمام فائلیں چیک کریں

آپ کے `fsmbaivoice-vercel` فولڈر میں یہ فائلیں ہونی چاہئیں:

```
fsmbaivoice-vercel/
├── index.html              ✅ مرکزی ویب سائٹ
├── api/
│   ├── generate.js         ✅ آواز بنانے کا کوڈ
│   ├── clone.js            ✅ آواز کلون کرنے کا کوڈ
│   └── voices.js           ✅ آوازوں کی فہرست
├── package.json            ✅ Node.js کی ترتیبات
├── vercel.json             ✅ Vercel کی ترتیبات
├── .gitignore              ✅ Git کی ترتیبات
└── README.md               ✅ انگریزی میں ہدایات
```

## مرحلہ 2: GitHub پر اپ لوڈ کریں

### 2.1 ٹرمینل کھولیں

**Windows پر:**
- `Win + R` دبائیں
- `cmd` ٹائپ کریں اور Enter دبائیں

**Mac/Linux پر:**
- Terminal ایپ کھولیں

### 2.2 اپنے فولڈر میں جائیں

```bash
cd /home/ubuntu/fsmbaivoice-vercel
```

### 2.3 Git شروع کریں

```bash
git init
git add .
git commit -m "FSMB AI Voice Platform - First Version"
```

### 2.4 GitHub پر نیا Repository بنائیں

1. https://github.com پر جائیں
2. اوپر دائیں کونے میں **"+"** پر کلک کریں
3. **"New repository"** منتخب کریں
4. Repository کا نام لکھیں: `fsmbaivoice`
5. **Private** منتخب کریں (تاکہ آپ کا کوڈ محفوظ رہے)
6. **"Create repository"** پر کلک کریں

### 2.5 اپنا کوڈ GitHub پر بھیجیں

GitHub آپ کو کچھ کمانڈز دکھائے گا۔ ان میں سے یہ والی کمانڈز استعمال کریں:

```bash
git remote add origin https://github.com/YOUR_USERNAME/fsmbaivoice.git
git branch -M main
git push -u origin main
```

**نوٹ:** `YOUR_USERNAME` کی جگہ اپنا GitHub username لکھیں۔

## مرحلہ 3: Vercel پر ڈیپلائے کریں

### 3.1 Vercel پر لاگ ان کریں

1. https://vercel.com پر جائیں
2. **"Sign Up"** یا **"Login"** پر کلک کریں
3. **"Continue with GitHub"** منتخب کریں
4. GitHub سے لاگ ان کریں

### 3.2 نیا پروجیکٹ بنائیں

1. Vercel کے Dashboard پر **"Add New..."** پر کلک کریں
2. **"Project"** منتخب کریں
3. اپنی GitHub repository `fsmbaivoice` تلاش کریں
4. **"Import"** پر کلک کریں

### 3.3 ترتیبات چیک کریں

Vercel خود بخود سب کچھ سیٹ کر لے گا:
- **Framework Preset:** Other
- **Root Directory:** ./
- **Build Command:** (خالی چھوڑ دیں)
- **Output Directory:** (خالی چھوڑ دیں)

### 3.4 ڈیپلائے کریں

1. **"Deploy"** پر کلک کریں
2. 1-2 منٹ انتظار کریں
3. جب **"Congratulations!"** نظر آئے، تو آپ کا کام ہو گیا!

### 3.5 اپنی ویب سائٹ کھولیں

Vercel آپ کو ایک لنک دے گا، جیسے:
```
https://fsmbaivoice.vercel.app
```

اس لنک پر کلک کریں اور اپنی ویب سائٹ دیکھیں!

## مرحلہ 4: پہلی بار استعمال کریں

### 4.1 لاگ ان کریں

1. اپنی ویب سائٹ کھولیں
2. لاگ ان اسکرین نظر آئے گی
3. **Username:** کوئی بھی نام لکھیں (مثلاً "majid")
4. **API Keys:** اپنی Speechify API keys لکھیں، comma سے الگ کریں:
   ```
   key1,key2,key3,key4,key5
   ```
5. **"Login"** پر کلک کریں

### 4.2 آواز بنائیں

1. دائیں پینل سے ایک آواز منتخب کریں
2. اپنا ٹیکسٹ لکھیں یا پیسٹ کریں
3. **"Generate Speech"** پر کلک کریں
4. انتظار کریں جب تک آواز بن جائے
5. **"Download"** پر کلک کر کے اپنی آڈیو فائل ڈاؤن لوڈ کریں

## اہم نوٹس

### ✅ فوائد

- **مفت ہوسٹنگ:** Vercel پر مفت میں چلتی ہے
- **تیز رفتار:** دنیا بھر میں تیز CDN
- **خودکار اپ ڈیٹس:** GitHub پر push کریں، Vercel خود اپ ڈیٹ ہو جائے گا
- **HTTPS:** خودکار SSL سرٹیفکیٹ

### ⚠️ حدود

- **10 سیکنڈ کی حد:** ہر request 10 سیکنڈ میں مکمل ہونی چاہیے
- **بہت لمبا ٹیکسٹ:** اگر آپ کا ٹیکسٹ بہت لمبا ہے (50+ منٹ کی آڈیو)، تو یہ timeout ہو سکتا ہے
- **localStorage:** آپ کا ڈیٹا صرف آپ کے براؤزر میں محفوظ ہے

### 🔧 حل

اگر بہت لمبی آڈیو بنانی ہو:
1. ٹیکسٹ کو چھوٹے حصوں میں تقسیم کریں
2. ہر حصہ الگ سے بنائیں
3. پھر تمام آڈیو فائلوں کو ایک ساتھ ملا لیں

## اپ ڈیٹس کیسے کریں؟

جب بھی آپ کوڈ میں تبدیلی کریں:

```bash
cd /home/ubuntu/fsmbaivoice-vercel
git add .
git commit -m "تبدیلیوں کی تفصیل"
git push
```

Vercel خود بخود آپ کی ویب سائٹ کو اپ ڈیٹ کر دے گا!

## مسائل کا حل

### مسئلہ 1: "404: NOT_FOUND"

**وجہ:** Vercel کو `index.html` نہیں مل رہی

**حل:**
1. چیک کریں کہ `index.html` root directory میں ہے
2. Vercel Dashboard سے دوبارہ deploy کریں

### مسئلہ 2: "Generation Failed"

**وجہ:** API key غلط ہے یا limit ختم ہو گئی

**حل:**
1. Settings میں جا کر API keys چیک کریں
2. نئی API keys ڈالیں
3. کچھ منٹ انتظار کریں اور دوبارہ کوشش کریں

### مسئلہ 3: آواز کلون نہیں ہو رہی

**وجہ:** آڈیو فائل بہت بڑی یا کوالٹی خراب ہے

**حل:**
1. 10-30 سیکنڈ کی صاف آڈیو استعمال کریں
2. WAV یا MP3 فارمیٹ استعمال کریں
3. فائل کا سائز 50MB سے کم رکھیں

## مدد چاہیے؟

اگر کوئی مسئلہ ہو:
1. README.md فائل پڑھیں (انگریزی میں تفصیلی ہدایات)
2. Vercel کی documentation دیکھیں: https://vercel.com/docs
3. Speechify API کی documentation: https://docs.speechify.com

---

**بہت بہت مبارک ہو! آپ کی ویب سائٹ اب لائیو ہے! 🎉**

اب آپ یہ لنک کسی کو بھی دے سکتے ہیں اور وہ آپ کی ویب سائٹ استعمال کر سکتا ہے۔
