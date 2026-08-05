# The Wedding Of Nisa & Rizy

Reproduksi 1:1 dari desain Figma (mobile, 430 × 12218 px) sebagai halaman web statis.

## Menjalankan
```bash
cd wedding-nisa-rizy
python3 -m http.server 8000
# buka http://localhost:8000  (lebar mobile ~430px)
```

## Struktur
- `index.html` — halaman utuh (React + Tailwind via CDN, dikompilasi di browser).
- `app.jsx`    — komponen hasil ekspor Figma (markup + kelas Tailwind sama persis).
- `assets/`    — seluruh gambar & ikon SVG dari desain (disimpan lokal).

Font dipetakan ke Google Fonts yang setara: Cinzel, Aboreto, Pinyon Script,
Vidaloka, Gilda Display, Zen Antique, ZCOOL XiaoWei, Poppins, dll.
Ikon memakai Font Awesome 6 (CDN).
