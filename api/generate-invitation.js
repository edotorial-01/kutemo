import { readFile } from 'fs/promises';
import { join } from 'path';
import { kv } from "@vercel/kv";
import { put } from "@vercel/blob";

/* Safely serialize value to JSON string safe for embedding inside <script> */
const sf = v => JSON.stringify(v ?? '').replace(/<\/script>/gi, '<\\/script>');

/* HTML attribute escape */
const he = s => (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* Convert "Wedding/luxora" → "luxora" */
const themeName = dir => (dir || '').split('/').pop().toLowerCase();

/* URL-safe slug */
const slugify = s =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.BLOB_READ_WRITE_TOKEN)
    return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN belum dikonfigurasi di Vercel Environment Variables' });

  const { themeDir, data, images, stories } = req.body || {};
  if (!themeDir || !data)
    return res.status(400).json({ error: 'themeDir dan data wajib diisi' });

  // ── Baca template HTML dari filesystem ────────────────────────────────
  let html;
  try {
    html = await readFile(join(process.cwd(), themeDir, 'index.html'), 'utf-8');
  } catch {
    return res.status(404).json({ error: `Template tidak ditemukan: ${themeDir}` });
  }

  const BASE  = `https://kutemo.id/${themeDir}`;
  const theme = themeName(themeDir);
  const img   = images || {};
  const sto   = stories || {};

  // ── 1. Generate slug lebih awal (dibutuhkan untuk URL cover og:image) ──
  const slug = [
    slugify(theme),
    slugify(data.pria   || 'mempelai'),
    'dan',
    slugify(data.wanita || 'mempelai'),
    Date.now().toString(36),
  ].join('-');

  // ── 2. Upload cover photo ke Blob untuk og:image ──────────────────────
  //     Pakai thumbnail (cover_thumb) sebagai cadangan jika foto cover
  //     penuh terlalu besar — thumbnail cukup untuk preview sosial media.
  let ogImageUrl = `https://kutemo.id/cover/${slugify(theme)}.webp`;
  const coverSrc = (img.cover && img.cover.startsWith('data:'))
    ? img.cover
    : ((img.cover_thumb && img.cover_thumb.startsWith('data:')) ? img.cover_thumb : null);
  if (coverSrc) {
    try {
      const m = coverSrc.match(/^data:([^;]+);base64,(.+)$/s);
      if (m) {
        const mime = m[1];
        const ext  = mime === 'image/png' ? 'png' : 'jpg';
        const buf  = Buffer.from(m[2], 'base64');
        const cb   = await put(`covers/${slug}.${ext}`, buf, {
          access: 'public',
          contentType: mime,
          addRandomSuffix: false,
        });
        ogImageUrl = cb.url;
      }
    } catch (e) {
      console.error('Cover upload for og:image failed (non-fatal):', e);
    }
  }

  // ── 3. Sembunyikan elemen demo-only dari undangan tamu ────────────────
  // (#action-popup = popup "Langkah Selanjutnya", #payModal = form pembayaran demo)
  html = html.replace('</head>', '<style>#action-popup,#payModal{display:none!important;}</style></head>');

  // ── 4. Strip OG/twitter meta lama, inject yang baru dengan data asli ──
  html = html.replace(/<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*\/?>/gi, '');
  const ogTitle = he(data.pria && data.wanita
    ? `Undangan Pernikahan ${data.pria} & ${data.wanita}`
    : data.pria || 'Undangan Digital');
  const ogDesc = he(
    [data.lokasi_resepsi || data.lokasi_akad, data.tanggal_resepsi || data.tanggal_akad]
      .filter(Boolean).join(' · ')
    || 'Kami mengundang Anda untuk hadir di hari spesial kami.'
  );
  const ogUrl = `https://kutemo.id/undangan/${slug}`;
  const ogMeta = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Kutemo">`,
    `<meta property="og:title" content="${ogTitle}">`,
    `<meta property="og:description" content="${ogDesc}">`,
    `<meta property="og:image" content="${ogImageUrl}">`,
    `<meta property="og:url" content="${ogUrl}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${ogTitle}">`,
    `<meta name="twitter:image" content="${ogImageUrl}">`,
  ].join('\n');
  html = html.replace('</head>', ogMeta + '\n</head>');

  // ── 5. Update <title> dengan nama mempelai asli ───────────────────────
  if (data.pria || data.wanita) {
    const pageTitle = data.pria && data.wanita
      ? `Undangan Pernikahan ${data.pria} & ${data.wanita}`
      : `Undangan ${data.pria || data.wanita}`;
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${he(pageTitle)}</title>`);
  }

  // ── 6. Perbaiki semua path relatif menjadi absolut ───────────────────
  html = html
    .replace(/src="(?!https?:\/\/)(?!\/\/)\.\//g, `src="${BASE}/`)
    .replace(/src='(?!https?:\/\/)(?!\/\/)\.\//g, `src='${BASE}/`)
    .replace(/href="(?!https?:\/\/)(?!\/\/)(?!#)(?!data:)\.\//g, `href="${BASE}/`)
    .replace(/href='(?!https?:\/\/)(?!\/\/)(?!#)(?!data:)\.\//g, `href='${BASE}/`)
    .replace(/url\(["']?\.\//g, `url('${BASE}/`)
    // golden-noir: musik.mp3 tanpa prefix ./
    .replace(/src="musik\.mp3"/g, `src="${BASE}/musik.mp3"`)
    .replace(/src='musik\.mp3'/g, `src='${BASE}/musik.mp3'`)
    // ensure Luxora countdown can still resolve cover2/cover3 even if base replacement alters URLs
    .replace(/background-image:\s*url\("\$\{D\.cover2\}"\)/g, 'background-image: url("${D.cover2}")')
    .replace(/background-image:\s*url\("\$\{D\.cover3\}"\)/g, 'background-image: url("${D.cover3}")');

        // ── 7. Update sumber musik jika user memilih lagu spesifik ───────────
  if (data.lagu) {
    const musicUrl = `https://kutemo.id/${data.lagu}`;
    // Handle bg-music (luxora, Royal-blue) dengan <source> child
    html = html.replace(
      /(<audio[^>]*id=["']bg-music["'][^>]*>[\s\S]*?<source\s+src=["'])[^"']+/,
      `$1${musicUrl}`
    );
    // Handle bgMusic (golden-noir, midnight-elegance) dengan <source> child
    html = html.replace(
      /(<audio[^>]*id=["']bgMusic["'][^>]*>[\s\S]*?<source\s+src=["'])[^"']+/,
      `$1${musicUrl}`
    );
    // Handle audio dengan src langsung (tanpa <source> child)
    html = html.replace(
      /(<audio[^>]*id=["']bg-music["'][^>]*\s+src=["'])[^"']+/,
      `$1${musicUrl}`
    );
    // Handle bgMusic dengan src langsung
    html = html.replace(
      /(<audio[^>]*id=["']bgMusic["'][^>]*\s+src=["'])[^"']+/,
      `$1${musicUrl}`
    );
  }

  // ── 8. Replace countdown preload (baca ktm_data dari localStorage) ───
  // Gunakan tanggal_resepsi untuk countdown & cover, fallback ke tanggal_akad
  // jika resepsi tidak diisi.
  const cdDate = data.tanggal_resepsi || data.tanggal_akad || '';
  const cdTime = data.tanggal_resepsi
    ? (data.waktu_resepsi || data.waktu_akad || '')
    : (data.waktu_akad || '');
  const CD_OLD = `var d=JSON.parse(localStorage.getItem('ktm_data')||'null');if(d&&d.tanggal_resepsi){`;
  const CD_NEW = `var d=${sf({ tanggal_resepsi: cdDate, waktu_resepsi: cdTime })};if(d&&d.tanggal_resepsi){`;
  html = html.split(CD_OLD).join(CD_NEW);

  // ── 8b & 8c. JAMINAN: inject window._ktmDate + replace countdown target ──
  // _wtFmt dulu pakai '.' sebagai separator → "09.00 – 12.00 WIB".
  // Regex [^0-9:] strips titik sehingga menghasilkan "09001" (bukan "09:00") →
  // new Date(...T09001:00+07:00) = Invalid Date → truthy → fallback tidak jalan → NaN.
  // Solusi: pakai regex yang extract jam & menit secara terpisah.
  if (cdDate) {
    const tmMatch = (cdTime || '').match(/(\d{1,2})[.:h](\d{2})/);
    const safeWt  = tmMatch
      ? String(+tmMatch[1]).padStart(2, '0') + ':' + tmMatch[2]
      : '08:00';
    const isoStr  = `${cdDate}T${safeWt}:00+07:00`;

    // 8b: Inject window._ktmDate ke </head> sebagai override paling awal
    html = html.replace('</head>',
      `<script>window._ktmDate=new Date(${sf(isoStr)});</script>\n</head>`);

    // 8c: Ganti target countdown timer langsung di kode tema (paling robust)
    // Pattern luxora: (window._ktmDate||new Date('...'))
    // Pattern lain:   window._ktmDate||new Date('...')
    const dtStr = sf(isoStr);
    html = html.replace(
      /\(window\._ktmDate\|\|new Date\('[^']*'\)\)/g,
      `new Date(${dtStr})`
    );
    html = html.replace(
      /window\._ktmDate\|\|new Date\('[^']*'\)/g,
      `new Date(${dtStr})`
    );
  }

  // ── 9. Deteksi jumlah galeri yang digunakan template ─────────────────
  // Java-Royale uses _gi; other themes use _i
  const usesGiVar = html.includes("for(var _gi=0;");
  const galMatch  = usesGiVar
    ? html.match(/for\(var _gi=0;_gi<(\d+);_gi\+\+\)_gal\.push\(localStorage/)
    : html.match(/for\(var _i=0;_i<(\d+);_i\+\+\)_gal\.push\(localStorage/);
  const galCount = galMatch ? parseInt(galMatch[1]) : 5;
  const galArr   = Array.from({ length: galCount }, (_, i) => img[`gallery_${i}`] || '');

  // ── 10. Build objek D lengkap dengan foto ter-embed ──────────────────
  const fullD = {
    ...data,
    cover:       img.cover || img.cover_thumb || '',
    cover2:      img.cover2      || '',
    cover3:      img.cover3      || '',
    foto_pria:   img.foto_pria   || '',
    foto_wanita: img.foto_wanita || '',
  };

  // ── 11. Replace blok utama data loading (localStorage) ───────────────
  // Build DL_OLD dynamically — templates differ in foto_pria/wanita lines and _gi/_i var
  const hasPhotoPria   = html.includes("    D.foto_pria=localStorage.getItem('ktm_foto_pria')||'';");
  const hasPhotoWanita = html.includes("    D.foto_wanita=localStorage.getItem('ktm_foto_wanita')||'';");
  const hasCover2      = html.includes("    D.cover2=localStorage.getItem('ktm_cover_2')||'';");
  const hasCover3      = html.includes("    D.cover3=localStorage.getItem('ktm_cover_3')||'';");
  const galLineOld = usesGiVar
    ? `    var _gal=[];for(var _gi=0;_gi<${galCount};_gi++)_gal.push(localStorage.getItem('ktm_gallery_'+_gi)||'');`
    : `    var _gal=[];for(var _i=0;_i<${galCount};_i++)_gal.push(localStorage.getItem('ktm_gallery_'+_i)||'');`;
  const DL_OLD = [
    "    var D=JSON.parse(localStorage.getItem('ktm_data')||'null');",
    "    if(!D)return;",
    "    D.cover=localStorage.getItem('ktm_cover')||'';",
    ...(hasCover2      ? ["    D.cover2=localStorage.getItem('ktm_cover_2')||'';"]        : []),
    ...(hasCover3      ? ["    D.cover3=localStorage.getItem('ktm_cover_3')||'';"]        : []),
    ...(hasPhotoPria   ? ["    D.foto_pria=localStorage.getItem('ktm_foto_pria')||'';"]   : []),
    ...(hasPhotoWanita ? ["    D.foto_wanita=localStorage.getItem('ktm_foto_wanita')||'';"] : []),
    galLineOld,
  ].join('\n');
  const DL_NEW = [
    `    var D=${sf(fullD)};`,
    `    if(!D)return;`,
    `    var _gal=${sf(galArr)};`,
  ].join('\n');
  html = html.split(DL_OLD).join(DL_NEW);

  // ── 12. Replace story loading jika ada (luxora) ───────────────────────
  const ST_OLD = [
    "    var _stories=[];try{_stories=JSON.parse(localStorage.getItem('ktm_story_teks')||'[]');}catch(e){_stories=[];}",
    "    var _stImgs=[];for(var _si=0;_si<6;_si++)_stImgs.push(localStorage.getItem('ktm_story_img_'+_si)||'');",
  ].join('\n');
  if (html.includes(ST_OLD)) {
    const stImgs = Array.from({ length: 6 }, (_, i) => sto.imgs?.[i] || '');
    const ST_NEW = [
      `    var _stories=${sf(sto.teks || [])};`,
      `    var _stImgs=${sf(stImgs)};`,
    ].join('\n');
    html = html.split(ST_OLD).join(ST_NEW);
  }

  // ── 13. Inject slug ke <head> (dipakai oleh ucapan interaktif) ───────
  html = html.replace('</head>',
    `<script>window._ktmSlug=${sf(slug)};</script>\n</head>`);

  // ── 13b. Inject overlay nama tamu (dibaca dari ?to= di URL) ──────────
  html = html.replace('</body>', `<div id="_ktm_to" style="position:fixed;inset:0;z-index:999990;background:rgba(0,0,0,.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:28px;font-family:Georgia,serif;transition:opacity .55s ease">
  <div style="text-align:center;max-width:300px;width:100%">
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:20px">
      <div style="flex:1;height:1px;background:rgba(255,255,255,.25)"></div>
      <span style="color:rgba(255,255,255,.5);font-size:14px">✦</span>
      <div style="flex:1;height:1px;background:rgba(255,255,255,.25)"></div>
    </div>
    <div style="color:rgba(255,255,255,.55);font-size:10px;letter-spacing:3.5px;text-transform:uppercase;font-family:sans-serif;font-weight:700;margin-bottom:14px">Kepada Yth.</div>
    <div id="_ktm_guest" style="color:#fff;font-size:26px;font-weight:700;line-height:1.35;margin-bottom:24px;text-shadow:0 2px 20px rgba(0,0,0,.4)"></div>
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:28px">
      <div style="flex:1;height:1px;background:rgba(255,255,255,.25)"></div>
      <span style="color:rgba(255,255,255,.5);font-size:14px">✦</span>
      <div style="flex:1;height:1px;background:rgba(255,255,255,.25)"></div>
    </div>
    <button onclick="(function(){var e=document.getElementById('_ktm_to');e.style.opacity='0';setTimeout(function(){e.style.display='none';if(typeof openInvitation==='function')openInvitation();},300);})()" style="background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.28);color:#fff;border-radius:50px;padding:13px 36px;font-size:13px;letter-spacing:.8px;cursor:pointer;font-family:sans-serif;font-weight:700">Buka Undangan ✉️</button>
  </div>
</div>
<script>(function(){var g=new URLSearchParams(location.search).get('to');if(!g){var e=document.getElementById('_ktm_to');if(e)e.style.display='none';return;}document.getElementById('_ktm_guest').textContent=g;})();</script>
</body>`);

  // ── 13c. Inject script ucapan interaktif (override submitRSVP → Supabase) ─
  // Deteksi input & list container secara universal antar-tema menggunakan ID.
  // Pada demo page (window._ktmSlug belum di-set), override tidak aktif.
  html = html.replace('</body>', `<script>
(function(){
  var SLUG=window._ktmSlug;
  if(!SLUG)return;
  var API='/api/ucapan?slug='+encodeURIComponent(SLUG);

  /* ── Helpers ── */
  function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function ago(iso){
    var d=Math.floor((Date.now()-new Date(iso))/60000);
    if(d<1)return'Baru saja';if(d<60)return d+'m lalu';
    var h=Math.floor(d/60);if(h<24)return h+'j lalu';return Math.floor(h/24)+'h lalu';
  }
  function _toast(m){
    var t=document.createElement('div');
    t.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1A6BFF;color:#fff;padding:12px 26px;border-radius:50px;font-size:13px;font-weight:700;z-index:999999;box-shadow:0 4px 20px rgba(26,107,255,.4);pointer-events:none;white-space:nowrap;font-family:sans-serif;transition:opacity .4s';
    t.textContent=m;document.body.appendChild(t);
    setTimeout(function(){t.style.opacity='0';setTimeout(function(){t.remove();},400);},2500);
  }

  /* ── Deteksi elemen per-tema menggunakan ID ── */
  function getNameEl(){return document.getElementById('rsvp-name')||document.getElementById('rsvpName');}
  function getMsgEl(){return document.getElementById('rsvp-msg-input')||document.getElementById('rsvpWish')||document.getElementById('rsvp-message')||document.getElementById('rsvpMsg');}
  function getAttend(){
    var chk=document.querySelector('input[name="attendance"]:checked');if(chk)return chk.value;
    var sel=document.getElementById('rsvpAttend');if(sel&&sel.value)return sel.value;
    if(typeof window.selectedAttend==='string'&&window.selectedAttend)return window.selectedAttend;
    if(typeof window.attendance==='string')return window.attendance;
    return'hadir';
  }
  function getListEl(){
    return document.getElementById('comments-list')||document.getElementById('wishesList')||
           document.getElementById('guestbook-list')||document.getElementById('commentsList');
  }

  /* ── Render ucapan dari API ── */
  function renderUcapan(list){
    var el=getListEl();if(!el)return;
    var labels={hadir:'✅ Akan Hadir',tidak:'❌ Tidak Dapat Hadir',ragu:'🤔 Mungkin Hadir',mungkin:'🤔 Mungkin Hadir'};
    if(!list.length){
      el.innerHTML='<div style="text-align:center;padding:28px 16px;opacity:.5;font-size:13px;font-family:sans-serif">Jadilah yang pertama memberikan ucapan 💌</div>';
      return;
    }
    el.innerHTML=list.map(function(u){
      return'<div style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);border-radius:14px;padding:14px 16px;margin-bottom:10px;font-family:sans-serif">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:5px">'+
        '<span style="font-weight:700;font-size:14px">'+esc(u.nama)+'</span>'+
        '<span style="font-size:11px;opacity:.55;white-space:nowrap;flex-shrink:0">'+ago(u.created_at)+'</span>'+
        '</div>'+
        (u.kehadiran?'<div style="font-size:11px;opacity:.65;margin-bottom:5px">'+(labels[u.kehadiran]||u.kehadiran)+'</div>':'')+
        (u.pesan?'<div style="font-size:13px;line-height:1.55;opacity:.9">'+esc(u.pesan)+'</div>':'')+
        '</div>';
    }).join('');
  }

  /* ── Load ucapan dari API ── */
  async function loadUcapan(){
    try{var r=await fetch(API);var d=await r.json();if(Array.isArray(d))renderUcapan(d);}catch(e){}
  }

  /* ── Override submitRSVP → simpan ke Supabase ── */
  var _orig=window.submitRSVP;
  window.submitRSVP=async function(){
    var ni=getNameEl(),mi=getMsgEl();
    var name=(ni&&ni.value||'').trim();
    if(!name){_toast('Mohon isi nama Anda');return;}
    var msg=(mi&&mi.value||'').trim();
    var attend=getAttend();
    /* Disable tombol kirim */
    var btns=document.querySelectorAll('[onclick*="submitRSVP"]');
    btns.forEach(function(b){b.disabled=true;b.style.opacity='.55';});
    try{
      var r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({nama:name,pesan:msg,kehadiran:attend})});
      if(r.ok){
        /* Kosongkan form */
        if(ni)ni.value='';if(mi)mi.value='';
        var chk=document.querySelector('input[name="attendance"]:checked');if(chk)chk.checked=false;
        var sel=document.getElementById('rsvpAttend');if(sel)sel.value='';
        if(typeof window.selectedAttend!=='undefined')window.selectedAttend='';
        if(typeof window.attendance!=='undefined')window.attendance='hadir';
        var btnH=document.getElementById('btnHadir');if(btnH){btnH.classList.add('active');}
        _toast('🎉 Ucapan berhasil terkirim!');
        await loadUcapan();
      }else{
        /* Fallback: jalankan logika asli tema */
        if(_orig)_orig();
      }
    }catch(e){if(_orig)_orig();}
    btns.forEach(function(b){b.disabled=false;b.style.opacity='';});
  };

  /* ── Load on ready + refresh tiap 30 detik ── */
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){loadUcapan();setInterval(loadUcapan,30000);});
  }else{
    loadUcapan();setInterval(loadUcapan,30000);
  }
})();
</script>
</body>`);

  // ── 14. Upload HTML undangan ke Vercel Blob ───────────────────────────
  let blobUrl;
  try {
    const blob = await put(`undangan/${slug}.html`, html, {
      access: 'public',
      contentType: 'text/html; charset=utf-8',
      addRandomSuffix: false,
    });
    blobUrl = blob.url;
  } catch (e) {
    console.error('Blob upload error:', e);
    return res.status(500).json({ error: 'Gagal menyimpan undangan: ' + e.message });
  }

  // ── 15. Simpan slug → blobUrl di Vercel KV + Supabase ──────────────
  //     Agar clean URL (https://kutemo.id/undangan/${slug}) selalu bisa
  //     diakses tanpa dependen pada satu penyimpanan saja.

  /* Simpan ke Vercel KV (primary) */
  try {
    await kv.set(`undangan:${slug}`, blobUrl);
  } catch (e) {
    console.error('KV set error (non-fatal):', e);
  }

  /* Simpan ke Supabase (secondary) */
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (SB_URL && SB_KEY) {
    try {
      await fetch(`${SB_URL}/rest/v1/invitations`, { method: 'POST',
        headers: { 'Content-Type': 'application/json',
          'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          slug,
          blob_url: blobUrl,
          theme,
          pria:     data.pria   || null,
          wanita:   data.wanita || null,
          order_id: data.order_id || null,
        }),
      });
    } catch (e) {
      console.error('Supabase insert error (non-fatal):', e);
    }
  }

  // Always return clean public URL — bukan blob storage .html
  const invUrl = `https://kutemo.id/undangan/${slug}`;
  return res.status(200).json({ url: invUrl, slug, blob_url: blobUrl });
}
