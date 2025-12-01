// public/dashboard.js
import { useEffect, useState, useRef } from 'react';

export default function Dashboard({ username, quota }) {
  const MAX_CHARS = 200000;
  const monthlyLimit = quota.monthly_limit;
  let [usedToday, setUsedToday] = useState(quota.daily_used);
  let [usedMonthly, setUsedMonthly] = useState(quota.monthly_used);
  const [text, setText] = useState('');
  const [normalize, setNormalize] = useState(true);
  const [speed, setSpeed] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [voices, setVoices] = useState([]);
  const [audioUrl, setAudioUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('Ready');
  const [cloneProgress, setCloneProgress] = useState(0);
  const [cloneText, setCloneText] = useState('Preparing...');
  const [cloneSuccess, setCloneSuccess] = useState(null);

  const textAreaRef = useRef();

  // EFFECT: Load voices on mount
  useEffect(() => {
    loadVoices();
  }, []);

  function effectiveText() {
    let t = text || '';
    if (normalize) {
      t = t.replace(/<[^>]*>/g,'').replace(/[\r\n]+/g,'. ').replace(/\s+/g,' ').trim();
    }
    return t;
  }

  function updateCounters() {
    const chars = effectiveText().length;
    return {
      chars,
      topTotal: `${chars.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`,
      sideDailyUsed: usedToday.toLocaleString(),
      sideMonthlyRemaining: Math.max(0, monthlyLimit - usedMonthly).toLocaleString(),
      quotaExhausted: usedMonthly >= monthlyLimit,
    };
  }

  async function loadVoices() {
    try {
      const res = await fetch('/api/voices');
      const data = await res.json();
      setVoices(data);
    } catch (e) {
      console.error('Failed to load voices', e);
    }
  }

  async function handleGenerate() {
    const chars = effectiveText().length;
    if (!selectedVoice) return alert('Please select a voice');
    if (!text.trim()) return alert('Please enter text');
    if (chars > MAX_CHARS) return alert(`Max ${MAX_CHARS} characters allowed`);
    if (usedMonthly + chars > monthlyLimit) return alert('Quota exhausted!');

    setProgress(0);
    setProgressText('Starting...');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: effectiveText(),
          voice: selectedVoice,
          title: 'audio',
          speed: 1 + speed / 100,
          normalize,
        }),
      });
      if (!res.ok) throw new Error('Network error');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.progress !== undefined) {
              const pct = Math.min(100, data.progress);
              setProgress(pct);
              setProgressText(`Progress: ${pct}%`);
            }
            if (data.audio_data) {
              const blob = new Blob([Uint8Array.from(atob(data.audio_data), c => c.charCodeAt(0))], { type: 'audio/mp3' });
              const url = URL.createObjectURL(blob);
              setAudioUrl(url);
              setUsedToday(usedToday + chars);
              setUsedMonthly(usedMonthly + chars);
            }
          } catch (e) { console.error('Parse error:', e); }
        }
      }
    } catch (err) {
      alert('Error: ' + err.message);
      setProgressText('Failed');
    }
  }

  async function handleCloneVoice(e) {
    e.preventDefault();
    const form = e.target;
    const voiceName = form.voice_name.value.trim();
    const file = form.audio.files[0];
    if (!voiceName) return alert('Enter voice name');
    if (!file) return alert('Select audio file');
    if (file.size > 50 * 1024 * 1024) return alert('File too large (max 50MB)');

    setCloneProgress(30);
    setCloneText('Cloning...');
    const formData = new FormData();
    formData.append('voice_name', voiceName);
    formData.append('audio', file);

    try {
      const res = await fetch('/api/clone-voice', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Clone failed');
      setCloneProgress(100);
      setCloneText('Done!');
      setCloneSuccess(`Voice cloned successfully: ${data.message}`);
      loadVoices();
    } catch (err) {
      alert('Error: ' + err.message);
      setCloneProgress(0);
      setCloneText('Failed');
    }
  }

  const counters = updateCounters();

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'Inter,sans-serif', background:'#07080a', color:'#e6eef6' }}>
      {/* LEFT NAV */}
      <aside style={{ width:240, background:'#0f1316', padding:20, display:'flex', flexDirection:'column', gap:18 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:8, background:'linear-gradient(135deg,#19a6ff,#6de3ff)', display:'flex', justifyContent:'center', alignItems:'center', color:'#021024', fontWeight:700 }}>F</div>
          <div>
            <h1 style={{ fontSize:16, margin:0 }}>FSMB AI</h1>
            <div style={{ fontSize:12, color:'#98a3b3' }}>Text to Speech</div>
          </div>
        </div>
        <nav style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <button onClick={()=>setSection('tts')} style={{ display:'flex', alignItems:'center', gap:10, padding:10, borderRadius:10, background:'#0f1316', border:'none', color:'#cfe8ff', cursor:'pointer' }}>Text to Speech</button>
          <button onClick={()=>setSection('clone')} style={{ display:'flex', alignItems:'center', gap:10, padding:10, borderRadius:10, background:'#0f1316', border:'none', color:'#cfe8ff', cursor:'pointer' }}>Voice Cloning</button>
          <button onClick={()=>setSection('history')} style={{ display:'flex', alignItems:'center', gap:10, padding:10, borderRadius:10, background:'#0f1316', border:'none', color:'#cfe8ff', cursor:'pointer' }}>History</button>
          <button onClick={()=>setSection('settings')} style={{ display:'flex', alignItems:'center', gap:10, padding:10, borderRadius:10, background:'#0f1316', border:'none', color:'#cfe8ff', cursor:'pointer' }}>Settings</button>
        </nav>
        <div style={{ marginTop:'auto', color:'#98a3b3', fontSize:13 }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}><span>Daily Used</span> <span>{counters.sideDailyUsed}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between' }}><span>Remaining</span> <span>{counters.sideMonthlyRemaining}</span></div>
          <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:8 }}>
            <div style={{ width:36, height:36, borderRadius:999, background:'#0e1114', display:'flex', alignItems:'center', justifyContent:'center' }}>{username[0].toUpperCase()}</div>
            <div><div style={{ fontWeight:600 }}>{username}</div><div style={{ fontSize:12, color:'#98a3b3' }}>@simba</div></div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex:1, display:'flex', gap:18, padding:20 }}>
        <section style={{ flex:1, display:'flex', flexDirection:'column', gap:14 }}>
          {/* TTS */}
          <div>
            <h2>Text to Speech</h2>
            <textarea
              ref={textAreaRef}
              value={text}
              onChange={e=>setText(e.target.value)}
              placeholder="Type or paste text..."
              maxLength={MAX_CHARS}
              style={{ width:'100%', height:300, background:'transparent', color:'#dfefff', padding:14, borderRadius:8, border:'1px dashed rgba(255,255,255,0.04)' }}
            />
            <div style={{ marginTop:8 }}>
              <button onClick={handleGenerate} style={{ padding:'12px 18px', background:'linear-gradient(90deg,#19a6ff,#6de3ff)', color:'#021024', fontWeight:700 }}>Generate Speech</button>
              <span style={{ marginLeft:10 }}>{effectiveText().length} chars</span>
            </div>
            <div style={{ marginTop:12, height:8, background:'rgba(255,255,255,0.03)', borderRadius:999 }}>
              <div style={{ width:`${progress}%`, height:'100%', background:'linear-gradient(90deg,#19a6ff,#6de3ff)' }}></div>
            </div>
            <div style={{ marginTop:6, color:'#98a3b3' }}>{progressText}</div>
            {audioUrl && <audio controls src={audioUrl} style={{ width:'100%', marginTop:12 }} />}
          </div>

          {/* VOICE CLONING */}
          <div style={{ marginTop:24 }}>
            <h2>Voice Cloning</h2>
            <form onSubmit={handleCloneVoice} style={{ display:'grid', gap:12 }}>
              <input type="text" name="voice_name" placeholder="Voice Name" required style={{ padding:12, borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'#0b0d0f', color:'#e6eef6' }} />
              <input type="file" name="audio" accept="audio/*,video/*" required style={{ padding:8, borderRadius:8, border:'1px dashed rgba(255,255,255,0.2)', background:'#0b0d0f', color:'#e6eef6' }} />
              <button type="submit" style={{ padding:'12px 18px', background:'linear-gradient(90deg,#19a6ff,#6de3ff)', color:'#021024', fontWeight:700 }}>Upload & Clone</button>
            </form>
            {cloneProgress>0 && (
              <div style={{ marginTop:16 }}>
                <div style={{ height:8, background:'rgba(255,255,255,0.03)', borderRadius:999 }}>
                  <div style={{ width:`${cloneProgress}%`, height:'100%', background:'linear-gradient(90deg,#19a6ff,#6de3ff)' }}></div>
                </div>
                <div style={{ marginTop:6, color:'#98a3b3' }}>{cloneText}</div>
              </div>
            )}
            {cloneSuccess && <div style={{ marginTop:16, padding:14, borderRadius:10, background:'rgba(25,166,255,0.1)', color:'#19a6ff' }}>{cloneSuccess}</div>}
          </div>
        </section>

        {/* RIGHT PANEL */}
        <aside style={{ width:360, minWidth:280, background:'#0f1316', borderRadius:12, padding:18 }}>
          <div>
            <label>Voice</label>
            <select value={selectedVoice} onChange={e=>setSelectedVoice(e.target.value)} style={{ width:'100%', padding:8, borderRadius:8, border:'1px solid rgba(255,255,255,0.03)', background:'#0b0d0f', color:'#e6eef6' }}>
              <option value="">-- Select Voice --</option>
              {voices.map(v=><option key={v.id} value={v.id}>{v.name} ({v.language})</option>)}
            </select>
          </div>
          <div style={{ marginTop:12 }}>
            <label>Speed</label>
            <input type="range" min="-50" max="50" value={speed} onChange={e=>setSpeed(e.target.value)} style={{ width:'100%' }} />
          </div>
          <div style={{ marginTop:12 }}>
            <label><input type="checkbox" checked={normalize} onChange={e=>setNormalize(e.target.checked)} /> Text Normalization</label>
          </div>
        </aside>
      </main>
    </div>
  );
}

// Example getServerSideProps to fetch user and quota
export async function getServerSideProps(context) {
  const username = 'Majid'; // Replace with real auth
  const quota = { daily_used:0, monthly_used:0, monthly_limit:10000000 };
  return { props: { username, quota } };
}
