// KesfetBul Backend — sade Node.js, harici paket gerektirmez.
// Çalıştırma: node server.js  (varsayılan port 3000, PORT env değişkeniyle değiştirilebilir)

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');
const PUBLIC_DIR = __dirname; // statik dosyalar artık ana klasörde (index.html)

// ---- Basit JSON "veritabanı" yardımcıları ----
function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ---- Arama niyeti tespiti (kural bazlı; ileride LLM API ile değiştirilebilir) ----
function detectMode(query, db) {
  const q = query.toLowerCase();
  const match = db.kategoriler.find(k => q.includes(k.slug) || q.includes(k.ad.toLowerCase()));
  if (match) return match;
  // varsayılan: bilinmeyen sorgular ürün modunda aranır
  return { slug: null, ad: query, tip: 'urun' };
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

  // ---- API: arama niyeti + sonuç ----
  if (pathname === '/api/ara' && req.method === 'GET') {
    const db = readDB();
    const q = (parsed.query.q || '').trim();
    if (!q) return sendJSON(res, 400, { hata: 'q parametresi gerekli' });

    const kategori = detectMode(q, db);
    if (kategori.tip === 'teklif') {
      const firmalar = db.firmalar.filter(f => f.kategori === kategori.slug);
      return sendJSON(res, 200, {
        tip: 'teklif',
        kategori: kategori.ad,
        firmaSayisi: firmalar.length,
        firmalar: firmalar.map(f => ({ ad: f.ad, sehir: f.sehir, puan: f.puan }))
      });
    } else {
      return sendJSON(res, 200, {
        tip: 'urun',
        sorgu: q,
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
});
