// KesfetBul Backend — sade Node.js, harici paket gerektirmez.
// Çalıştırma: node server.js  (varsayılan port 3000, PORT env değişkeniyle değiştirilebilir)
// Gerçek AI için ANTHROPIC_API_KEY ortam değişkeni gerekir (yoksa otomatik olarak
// basit anahtar kelime tespitine düşer, site yine çalışır).

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');
const PUBLIC_DIR = __dirname; // statik dosyalar artık ana klasörde (index.html)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

// ---- Basit JSON "veritabanı" yardımcıları ----
function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ---- Kural bazlı tespit (AI yoksa veya AI hata verirse yedek plan) ----
function detectModeRuleBased(query, db) {
  const q = query.toLowerCase();
  const match = db.kategoriler.find(k => q.includes(k.slug) || q.includes(k.ad.toLowerCase()));
  if (match) return { tip: match.tip, kategoriSlug: match.slug, kategoriAd: match.ad, cevap: null };
  return { tip: 'urun', kategoriSlug: null, kategoriAd: query, cevap: null };
}

// ---- Gerçek AI ile niyet tespiti + doğal dil cevabı ----
async function detectModeAI(query, db) {
  if (!ANTHROPIC_API_KEY) return null; // anahtar yoksa kural bazlıya düş

  const kategoriListesi = db.kategoriler.map(k => `${k.slug} (${k.ad}, tip: ${k.tip})`).join(', ');
  const systemPrompt = `Sen KesfetBul adlı bir alışveriş/hizmet keşif platformunun yapay zeka asistanısın. Kullanıcının arama sorgusunu analiz et.

Mevcut kategoriler: ${kategoriListesi}

Kurallar:
- Eğer sorgu bu kategorilerden biriyle eşleşiyorsa (branda, avukat, muhasebeci, tadilat, sigorta, nakliye gibi "teklif" tipi kategoriler), bunu belirt.
- Eşleşmiyorsa veya standart bir ürünse (telefon, laptop, ayakkabı vb.), tip "urun" olsun.
- Kullanıcıya sıcak, kısa (1-2 cümle), Türkçe bir yanıt yaz. "teklif" tipindeyse, bunun standart fiyatı olmayan özelleştirilebilir bir ürün/hizmet olduğunu ve teklif toplamanın en iyi yol olduğunu belirt.

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{"tip": "teklif" veya "urun", "kategoriSlug": "eşleşen slug veya null", "cevap": "kullanıcıya gösterilecek doğal dil yanıtı"}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: query }]
      })
    });
    const data = await res.json();

    if (!res.ok || data.type === 'error') {
      console.error('Anthropic API hatası. HTTP durumu:', res.status, '- Detay:', JSON.stringify(data));
      return null;
    }

    const text = (data.content || []).map(b => b.text || '').join('');
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const kategori = db.kategoriler.find(k => k.slug === parsed.kategoriSlug);
    return {
      tip: parsed.tip === 'teklif' ? 'teklif' : 'urun',
      kategoriSlug: kategori ? kategori.slug : null,
      kategoriAd: kategori ? kategori.ad : query,
      cevap: parsed.cevap || null
    };
  } catch (e) {
    console.error('AI çağrısı başarısız, kural bazlıya düşülüyor:', e.message);
    return null;
  }
}

async function detectMode(query, db) {
  const aiSonuc = await detectModeAI(query, db);
  if (aiSonuc) return aiSonuc;
  return detectModeRuleBased(query, db);
}

function sendJSON(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      // SPA fallback: bilinmeyen yolları index.html'e yönlendir
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexContent);
      });
      return;
    }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': (types[ext] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(content);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ---- API: arama niyeti + sonuç (artık gerçek AI destekli) ----
  if (pathname === '/api/ara' && req.method === 'GET') {
    const db = readDB();
    const q = (parsed.query.q || '').trim();
    if (!q) return sendJSON(res, 400, { hata: 'q parametresi gerekli' });

    const sonuc = await detectMode(q, db);

    if (sonuc.tip === 'teklif') {
      const firmalar = db.firmalar.filter(f => f.kategori === sonuc.kategoriSlug);
      return sendJSON(res, 200, {
        tip: 'teklif',
        kategori: sonuc.kategoriAd,
        cevap: sonuc.cevap,
        firmaSayisi: firmalar.length,
        firmalar: firmalar.map(f => ({ ad: f.ad, sehir: f.sehir, puan: f.puan }))
      });
    } else {
      return sendJSON(res, 200, {
        tip: 'urun',
        sorgu: q,
        cevap: sonuc.cevap,
        sonuclar: db.urunler
      });
    }
  }

  // ---- API: kategori listesi ----
  if (pathname === '/api/kategoriler' && req.method === 'GET') {
    const db = readDB();
    return sendJSON(res, 200, db.kategoriler);
  }

  // ---- API: ürünler ----
  if (pathname === '/api/urunler' && req.method === 'GET') {
    const db = readDB();
    return sendJSON(res, 200, db.urunler);
  }

  // ---- API: teklif talebi oluştur ----
  if (pathname === '/api/teklif' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { kategori, isim, telefon, sehir, detay } = body;
      if (!isim || !telefon || !kategori) {
        return sendJSON(res, 400, { hata: 'kategori, isim ve telefon zorunludur' });
      }
      const db = readDB();
      const kayit = {
        id: Date.now(),
        kategori, isim, telefon, sehir: sehir || '', detay: detay || '',
        tarih: new Date().toISOString(),
        durum: 'yeni'
      };
      db.teklifler.push(kayit);
      writeDB(db);

      const eslesenFirmaSayisi = db.firmalar.filter(f => f.kategori === kategori).length;
      return sendJSON(res, 201, { basarili: true, kayit, eslesenFirmaSayisi });
    } catch (e) {
      return sendJSON(res, 400, { hata: 'geçersiz istek gövdesi' });
    }
  }

  // ---- API: admin - tüm teklifleri listele (basit, auth yok — üretimde eklenmeli) ----
  if (pathname === '/api/teklifler' && req.method === 'GET') {
    const db = readDB();
    return sendJSON(res, 200, db.teklifler);
  }

  // ---- statik dosyalar ----
  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`KesfetBul backend http://localhost:${PORT} adresinde çalışıyor`);
  console.log(ANTHROPIC_API_KEY ? '✓ Gerçek AI aktif' : '⚠ AI anahtarı yok, kural bazlı moda çalışıyor');
});
