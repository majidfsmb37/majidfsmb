<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

/**
 * Speechify Voice Cloning — compatible with dashboard.js handlers
 * - Returns JSON:
 * { ok:true, message:'...', voice:{ id, name }, voice_name: "..." }
 */

try {
  // ========= CONFIG =========
  $apiKey = "VmvqmOk0NoTKBdEmLiEI87WS-mMfvbd9Sj_Uq7OuhPM=";
  $apiEndpoint = "https://api.sws.speechify.com/v1/voices";
  $users_file = __DIR__ . "/users.json";
  $voices_file = __DIR__ . "/voices.json";
  $voices_dir = __DIR__ . "/voices";

  // ========= GUARDS =========
  if (empty($_SESSION['username'])) {
    http_response_code(401);
    echo json_encode(['ok'=>false,'error'=>'Not logged in']); 
    exit;
  }
  $username = $_SESSION['username'];

  // Ensure files/dirs exist
  if (!file_exists($users_file)) file_put_contents($users_file, json_encode(new stdClass(), JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
  if (!file_exists($voices_file)) file_put_contents($voices_file, json_encode([], JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
  if (!is_dir($voices_dir)) @mkdir($voices_dir, 0775, true);

  // Load user
  $users = json_decode(file_get_contents($users_file), true);
  if (!is_array($users)) $users = [];
  if (!isset($users[$username])) {
    echo json_encode(['ok'=>false,'error'=>'User not found']); 
    exit;
  }

  // Input validation
  $voiceName = trim($_POST['voice_name'] ?? '');
  if ($voiceName === '') $voiceName = 'Voice_' . bin2hex(random_bytes(4));

  if (!isset($_FILES['audio']) || $_FILES['audio']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['ok'=>false,'error'=>'No audio uploaded']); 
    exit;
  }
  $tmp = $_FILES['audio']['tmp_name'];
  if (!is_uploaded_file($tmp)) {
    echo json_encode(['ok'=>false,'error'=>'Invalid upload']); 
    exit;
  }
  if ($_FILES['audio']['size'] > 50*1024*1024) {
    echo json_encode(['ok'=>false,'error'=>'File too large (max 50MB)']); 
    exit;
  }

  // Prepare CURL file
  $mime = function_exists('mime_content_type') ? @mime_content_type($tmp) : 'audio/mpeg';
  $nameOnWire = $_FILES['audio']['name'] ?: ('sample_' . time() . '.mp3');
  $cfile = new CURLFile($tmp, $mime, $nameOnWire);

  // Consent payload
  $consent = [
    "fullName" => $username,
    "email" => $username . "@example.com"
  ];

  // Build POST fields
  $postFields = [
    "name" => $voiceName,
    "gender" => "male",
    "consent" => json_encode($consent),
    "sample" => $cfile
  ];

  // ========= CURL REQUEST =========
  $ch = curl_init($apiEndpoint);
  curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER => ["Authorization: Bearer $apiKey"],
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POSTFIELDS => $postFields,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_TIMEOUT => 120
  ]);
  $response = curl_exec($ch);
  $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $curl_err = curl_error($ch);
  curl_close($ch);

  if ($response === false) {
    echo json_encode(['ok'=>false,'error'=>'CURL error: '.$curl_err]); 
    exit;
  }

  $data = json_decode($response, true);

  // Success: 200 or 201 + valid voice ID
  if (($http_code === 200 || $http_code === 201) && is_array($data) && !empty($data['id'])) {
    $voice_id = $data['id'];
    $voice_name = $data['display_name'] ?? $voiceName;

    // ====== Persist to users.json ======
    if (!isset($users[$username]['voices']) || !is_array($users[$username]['voices'])) {
      $users[$username]['voices'] = [];
    }
    $exists = false;
    foreach ($users[$username]['voices'] as $v) {
      if (!empty($v['id']) && $v['id'] === $voice_id) { 
        $exists = true; 
        break; 
      }
    }
    if (!$exists) {
      $users[$username]['voices'][] = ["id" => $voice_id, "name" => $voice_name];
    }

    // Remove from removed_voices if exists
    if (!empty($users[$username]['removed_voices']) && is_array($users[$username]['removed_voices'])) {
      $idx = array_search($voice_id, $users[$username]['removed_voices'], true);
      if ($idx !== false) {
        unset($users[$username]['removed_voices'][$idx]);
        $users[$username]['removed_voices'] = array_values($users[$username]['removed_voices']);
      }
    }
    file_put_contents($users_file, json_encode($users, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE), LOCK_EX);

    // ====== Optional: Global voices.json ======
    $voices = json_decode(@file_get_contents($voices_file), true);
    if (!is_array($voices)) $voices = [];
    $byId = [];
    foreach ($voices as $v) { if (isset($v['id'])) $byId[$v['id']] = true; }
    if (empty($byId[$voice_id])) {
      $voices[] = [
        'id' => $voice_id,
        'name' => $voice_name,
        'language' => $data['language'] ?? null,
        'created_by' => $username,
        'created_at' => date('c')
      ];
      file_put_contents($voices_file, json_encode($voices, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE), LOCK_EX);
    }

    // ====== FINAL JSON RESPONSE (JS ?? ???? ??????) ======
    echo json_encode([
      'ok' => true,
      'message' => "Voice '{$voice_name}' cloned successfully!",
      'voice' => ['id' => $voice_id, 'name' => $voice_name],
      'voice_name' => $voice_name  // JS ??? ${data.voice_name} ??? ??? ??
    ]);
    exit;
  }

  // ====== API Error ======
  echo json_encode([
    'ok' => false,
    'error' => $data['message'] ?? 'Clone failed',
    'http' => $http_code,
    'response' => $response
  ]);

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>'Server error: '.$e->getMessage()]);
}
?>
