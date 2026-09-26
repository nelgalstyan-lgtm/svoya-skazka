// /models — пускает ли OpenAI запросы из этого дата-центра Cloudflare (бесплатно).
// /draw   — одна картинка как в server/lib/illustrate.js (images/edits, 1024x1536, medium), ≈1 ₽.
// Оба пути требуют ?k=PROBE_KEY.
const REF_URL = 'https://geroenok.online/assets/scenes/forest_path.jpg';

// Вырезаем b64_json из байтов ответа, не разбирая весь JSON и не делая из 2 МБ строку целиком.
function extractB64(bytes) {
  const marker = new TextEncoder().encode('"b64_json"');
  let i = indexOf(bytes, marker, 0);
  if (i < 0) return null;
  i = bytes.indexOf(0x22, i + marker.length); // открывающая кавычка значения
  const end = bytes.indexOf(0x22, i + 1);
  return new TextDecoder().decode(bytes.subarray(i + 1, end));
}

function indexOf(bytes, needle, from) {
  for (let i = bytes.indexOf(needle[0], from); i >= 0; i = bytes.indexOf(needle[0], i + 1)) {
    let ok = true;
    for (let j = 1; j < needle.length && ok; j++) ok = bytes[i + j] === needle[j];
    if (ok) return i;
  }
  return -1;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get('k') !== env.PROBE_KEY) return new Response('not found', { status: 404 });
    const colo = request.cf?.colo;
    const auth = { Authorization: `Bearer ${env.OPENAI_API_KEY}` };

    if (url.pathname === '/models') {
      const r = await fetch('https://api.openai.com/v1/models', { headers: auth });
      return Response.json({ colo, status: r.status, body: (await r.text()).slice(0, 200) });
    }

    if (url.pathname === '/draw') {
      const t0 = Date.now();
      const ref = await (await fetch(REF_URL)).arrayBuffer();
      const form = new FormData();
      form.append('model', 'gpt-image-1.5');
      form.append('prompt', 'Watercolor children\'s book illustration of a small hedgehog walking along this forest path, soft colors.');
      form.append('image[]', new Blob([ref], { type: 'image/jpeg' }), 'ref-1.jpeg');
      form.append('size', '1024x1536');
      form.append('quality', 'medium');
      const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: auth, body: form });
      const bytes = new Uint8Array(await r.arrayBuffer());
      const tOpenAI = Date.now() - t0;
      if (!r.ok) return Response.json({ colo, status: r.status, error: new TextDecoder().decode(bytes.subarray(0, 300)) });
      const png = Uint8Array.fromBase64(extractB64(bytes));
      if (env.BUCKET) await env.BUCKET.put(`probe/${Date.now()}.png`, png, { httpMetadata: { contentType: 'image/png' } });
      return Response.json({ colo, responseBytes: bytes.length, pngBytes: png.length, savedToR2: !!env.BUCKET, wallMs: Date.now() - t0, openaiMs: tOpenAI });
    }
    return new Response('not found', { status: 404 });
  }
};
