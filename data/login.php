<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VIP Login — FSMB AI Voice</title>
<style>
  body { font-family: Arial, sans-serif; background: linear-gradient(135deg,#1e3c72,#2a5298); color:#fff; display:flex; justify-content:center; align-items:center; height:100vh; }
  .login-container { background: rgba(0,0,0,0.7); padding:40px; border-radius:20px; width:320px; text-align:center; }
  input { width:100%; padding:12px; margin:10px 0; border-radius:8px; border:none; }
  button { width:100%; padding:12px; border:none; border-radius:8px; background:gold; color:#1e3c72; font-weight:bold; cursor:pointer; }
</style>
</head>
<body>
<div class="login-container">
  <h2>FSMB AI Voice Login</h2>
  <form id="loginForm">
    <input type="text" id="username" placeholder="Username" required>
    <input type="password" id="password" placeholder="Password" required>
    <button type="submit">Login</button>
  </form>
  <div id="error" style="color:red;margin-top:10px;"></div>
</div>

<script>
const form = document.getElementById('loginForm');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = form.username.value;
  const password = form.password.value;

  const res = await fetch('/api/login.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if(data.success){
    localStorage.setItem('userToken', data.token);
    localStorage.setItem('username', username);
    window.location.href = '/index.html';
  } else {
    document.getElementById('error').innerText = data.error;
  }
});
</script>
</body>
</html>
