# KesfetBul — Çalışan Prototip (Frontend + Backend)

Hiçbir harici npm paketi gerektirmez (sade Node.js `http` modülüyle yazıldı). Bu yüzden kurulum tek adım.

## Yerelde çalıştırma

```bash
node server.js
```

Tarayıcıda `http://localhost:3000` adresini aç. Arama kutusuna "branda", "avukat" gibi kelimeler yazarsan Teklif Al akışı, "iphone" gibi standart ürün yazarsan ürün listesi akışı devreye girer.

## Neler gerçek, neler değil

**Gerçek çalışıyor:**
- `/api/ara?q=...` — arama sorgusunu kategori bazında ayırt eder (teklif vs. ürün)
- `/api/teklif` (POST) — teklif taleplerini `db.json` içine kalıcı olarak kaydeder
- `/api/urunler`, `/api/kategoriler` — veriyi `db.json`'dan okur
- Frontend, bu API'lere gerçek `fetch()` çağrıları yapıyor

**Henüz gerçek değil / sonraki adımlar:**
- **Yapay zeka** — Şu an kategori tespiti basit anahtar kelime eşleştirmesi (`server.js` içindeki `detectMode` fonksiyonu). Gerçek doğal dil anlama için Anthropic/OpenAI API'sine bağlanmak gerekir.
- **Firma bildirimi** — Teklif geldiğinde firmalara otomatik SMS/e-posta gitmiyor, sadece veritabanına kaydediliyor.
- **Firma paneli** — Firmaların giriş yapıp kendi tekliflerini görebileceği bir arayüz yok.
- **Ödeme/paket sistemi** — Henüz eklenmedi.
- **Veritabanı** — `db.json` bir dosya, gerçek üretimde PostgreSQL/MySQL gibi bir veritabanına geçmek gerekir.

## kesfetbul.com'a canlıya alma (deploy)

### 1. Render.com'da deploy edin
- Render.com'da "New Web Service" → GitHub reponuzu seçin
- Build command: boş bırakın
- Start command: `node server.js`
- Deploy edin, size bir `xxx.onrender.com` adresi verecek

### 2. Domaini bağlayın
- Hostinger'daki domain DNS ayarlarına, Render'ın verdiği kaydı ekleyin
- DNS yayılması birkaç saat sürebilir

## Klasör yapısı
```
kesfetbul/
  server.js       → backend (API + statik dosya sunucusu)
  package.json
  db.json         → kategoriler, firmalar, ürünler, gelen teklifler
  index.html      → frontend (tek dosya, CSS+JS içinde)
  README.md
```
