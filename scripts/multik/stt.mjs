import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('C:/Users/Asus/svoya-skazka/server/.env','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]));
const dir = process.argv[2];
const prompt = 'Transcribe all speech in this 8-second audio clip from a Russian cartoon. For each phrase give start and end time in seconds and who speaks: "teen boy", "small child", "woman" or "other". Answer as JSON: {"lines":[{"start":0.0,"end":0.0,"who":"...","text":"..."}]}. If there is no speech, {"lines":[]}.';
for (const f of fs.readdirSync(dir).filter(f=>f.endsWith('.wav')).sort()) {
  const data = fs.readFileSync(`${dir}/${f}`).toString('base64');
  let out = '';
  for (const model of ['gemini-3.5-flash-lite','gemini-3.6-flash']) { try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method:'POST', headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_API_KEY}, signal: AbortSignal.timeout(90000), body: JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'audio/wav',data}}]}],generationConfig:{temperature:0,responseMimeType:'application/json'}})});
    if (!res.ok) continue;
    out = model + ' ' + ((await res.json())?.candidates?.[0]?.content?.parts||[]).map(p=>p.text).join('');
    break;
  } catch (e) { out = 'ERR ' + e.message; } }
  console.log(f, out.replace(/\s+/g,' '));
}
