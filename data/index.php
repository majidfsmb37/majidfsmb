<?php
session_start();

// --- USERS JSON FILE ---
$users_file = __DIR__ . '/data/users.json';
$users = file_exists($users_file) ? json_decode(file_get_contents($users_file), true) : [];

// --- CHECK LOGIN ---
if(empty($_SESSION['username'])){
    header('Location: login.php');
    exit;
}

$username = $_SESSION['username'];
$user = $users[$username] ?? null;
if(!$user){
    session_destroy();
    header('Location: login.php');
    exit;
}

// --- USER DATA ---
$apiKeys = $user['apiKeys'] ?? [];
$usedChars = $user['usedChars'] ?? 0;
?>

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FSMB AI - Voice Platform</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css">
<style>
/* --- BASIC STYLES --- */
:root{--bg:#07080a;--panel:#0f1316;--muted:#98a3b3;--neon:#19a6ff;--accent:#7de3c7;--card:#0b0d0f;}
*{box-sizing:border-box;}
body{margin:0;font-family:Inter,sans-serif;color:#e6eef6;background:#07080a;display:flex;min-height:100vh;}
.left-nav{width:240px;background:#0f1316;display:flex;flex-direction:column;padding:20px;border-right:1px solid rgba(255,255,255,0.03);}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:24px;}
.brand .logo{width:36px;height:36px;background:linear-gradient(135deg,var(--neon),#6de3ff);display:flex;align-items:center;justify-content:center;border-radius:8px;font-weight:700;color:#021024;}
.brand h1{margin:0;font-size:16px;font-weight:600;color:#fff;}
.nav-list{display:flex;flex-direction:column;gap:6px;}
.nav-btn{display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;background:transparent;color:#cfe8ff;border:none;cursor:pointer;font-size:14px;transition:.2s;}
.nav-btn.active,.nav-btn:hover{background:rgba(25,166,255,0.1);}
.nav-btn i{width:18px;text-align:center;color:#19a6ff;}
.left-footer{margin-top:auto;font-size:13px;color:#98a3b3;}
.left-footer .user-bubble{display:flex;gap:10px;align-items:center;margin-top:8px;}
.left-footer .avatar{width:36px;height:36px;border-radius:999px;background:#0e1114;display:flex;align-items:center;justify-content:center;color:#fff;border:1px solid rgba(255,255,255,0.03);}
.workspace{flex:1;display:flex;gap:18px;padding:20px;overflow:auto;}
.center{flex:1;display:flex;flex-direction:column;gap:14px;}
.editor{background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));border-radius:12px;padding:16px;min-height:400px;border:1px solid rgba(255,255,255,0.03);}
textarea{width:100%;height:520px;background:transparent;border:1px dashed rgba(255,255,255,0.04);color:#dfefff;padding:14px;border-radius:8px;font-size:15px;resize:vertical;}
.controls{display:flex;align-items:center;gap:12px;justify-content:space-between;margin-top:8px;}
.generate-btn{background:linear-gradient(90deg,#19a6ff,#6de3ff);color:#021024;border:none;padding:12px 18px;border-radius:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;}
.generate-btn[disabled]{opacity:0.5;cursor:not-allowed;background:#555;}
.right-panel{width:360px;min-width:280px;background:#0f1316;border-radius:12px;padding:18px;border:1px solid rgba(255,255,255,0.03);box-shadow:0 6px 30px rgba(0,0,0,0.6);height:calc(100vh - 40px);overflow:auto;}
.model-card{background:linear-gradient(180deg,rgba(255,255,255,0.01),rgba(255,255,255,0.005));padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.02);margin-bottom:12px;}
label.small{display:block;color:#98a3b3;font-size:13px;margin-bottom:6px;}
input,select,textarea{background:#0b0d0f;border:1px solid rgba(255,255,255,0.03);padding:8px;border-radius:8px;color:#e6eef6;font-size:14px;width:100%;}
.slider{width:100%;}
.progress{background:rgba(255,255,255,0.03);height:8px;border-radius:999px;overflow:hidden;margin-top:8px;}
.progress > i{display:block;height:100%;background:linear-gradient(90deg,#19a6ff,#6de3ff);width:0%;transition:width .3s ease;}
.audio-wrap{margin-top:12px;}
.voice-list-modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:none;align-items:center;justify-content:center;z-index:999;}
.voice-list-box{background:#0f1316;padding:24px;border-radius:16px;width:90%;max-width:500px;max-height:80vh;overflow:auto;border:1px solid rgba(255,255,255,0.1);}
.voice-item{padding:12px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;transition:.2s;}
.voice-item:hover{background:rgba(25,166,255,0.1);}
.voice-item.selected{background:rgba(25,166,255,0.2);font-weight:600;}
</style>
</head>
<body>

<!-- LEFT NAV -->
<aside class="left-nav">
  <div class="brand">
    <div class="logo">F</div>
    <div>
      <h1>FSMB AI</h1>
      <div style="font-size:12px;color:#98a3b3">Text to Speech</div>
    </div>
  </div>
  <nav class="nav-list">
    <button class="nav-btn active" onclick="showSection('tts')"><i class="fa-solid fa-microphone"></i><span>Text to Speech</span></button>
    <button class="nav-btn" onclick="showSection('clone')"><i class="fa-solid fa-clone"></i><span>Voice Cloning</span></button>
    <button class="nav-btn" onclick="showSection('settings')"><i class="fa-solid fa-gear"></i><span>Settings</span></button>
  </nav>
  <div class="left-footer">
    <div>Characters Used: <span id="sideDailyUsed"><?php echo number_format($usedChars); ?></span></div>
    <div class="user-bubble">
      <div class="avatar"><?php echo strtoupper($username[0]); ?></div>
      <div><div><?php echo htmlspecialchars($username); ?></div><div style="font-size:12px;color:#98a3b3">@fsmb</div></div>
    </div>
    <form method="post" action="logout.php" style="margin-top:8px;">
      <button type="submit" class="nav-btn"><i class="fa-solid fa-sign-out"></i><span>Logout</span></button>
    </form>
  </div>
</aside>

<!-- MAIN WORKSPACE -->
<main class="workspace">
  <section class="center">
    <!-- TTS -->
    <div id="tts" class="editor section">
      <h2>Text to Speech</h2>
      <textarea id="text" maxlength="200000" placeholder="Type or paste text here..."></textarea>
      <div class="controls">
        <button class="generate-btn" id="generateBtn" onclick="startGenerate()"><i class="fa-solid fa-bolt"></i> Generate Speech</button>
        <span id="charCount">0 chars</span>
      </div>
      <div class="progress"><i></i></div>
      <div class="audio-wrap"><audio id="audio" controls style="width:100%;display:none"></audio></div>
    </div>

    <!-- VOICE CLONING -->
    <div id="clone" class="editor section" style="display:none;">
      <h2>Voice Cloning</h2>
      <form id="cloneForm" style="display:grid;gap:12px;">
        <input type="text" id="voiceName" placeholder="Voice Name" required>
        <input type="file" id="audioFile" accept="audio/*" required>
        <button type="submit" class="generate-btn"><i class="fa-solid fa-upload"></i> Upload & Clone</button>
      </form>
      <div id="cloneProgress" style="display:none;">
        <div class="progress"><i id="cloneBar" style="width:0%"></i></div>
        <span id="cloneText">Processing...</span>
      </div>
      <div id="cloneSuccess" style="display:none;color:#7de3c7;"><i class="fa-solid fa-check-circle"></i> Voice cloned successfully!</div>
    </div>

    <!-- SETTINGS -->
    <div id="settings" class="editor section" style="display:none;">
      <h2>Settings</h2>
      <label class="small">Username</label>
      <input type="text" value="<?php echo htmlspecialchars($username); ?>" readonly>
      <label class="small">API Keys (comma-separated)</label>
      <textarea id="settingsApiKeys"><?php echo implode(',', $apiKeys); ?></textarea>
      <button class="generate-btn" onclick="saveSettings()"><i class="fa-solid fa-save"></i> Save Settings</button>
    </div>
  </section>

  <!-- RIGHT PANEL -->
  <aside class="right-panel">
    <div class="model-card">
      <div class="card-title"><span class="model-name">Voice</span></div>
      <button onclick="openVoiceList()" style="padding:10px 14px;background:#19a6ff;color:#021024;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Select Voice</button>
      <div id="selectedVoiceName" style="margin-top:8px;color:#eaf8ff;font-weight:600;">No voice selected</div>
    </div>
    <label class="small">Title</label>
    <input id="rightFilename" type="text" placeholder="audio-title" value="fsmb-voice">
    <label class="small">Speed</label>
    <input type="range" id="speedRange" min="-50" max="50" value="0" class="slider">
  </aside>
</main>

<script>
function showSection(id){
  document.querySelectorAll('.section').forEach(s=>s.style.display='none');
  document.getElementById(id).style.display='block';
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  event.currentTarget.classList.add('active');
}

document.getElementById('text').addEventListener('input',function(){
  document.getElementById('charCount').innerText = this.value.length + ' chars';
});

function startGenerate(){
  alert('TTS generate function to integrate with your API.');
}
function openVoiceList(){alert('Voice selection modal here.');}
function saveSettings(){alert('Save API keys to users.json via backend.');}
</script>

</body>
</html>
