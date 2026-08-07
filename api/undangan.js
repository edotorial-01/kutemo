import { kv } from "@vercel/kv";
import { list } from "@vercel/blob";

export default async function handler(req, res) {
  const slug = req.query.slug || "";
  if (!slug) return res.status(400).send("Missing slug");

  let blobUrl;

  // ── 1. Coba Vercel KV (primary) ───────────────────────────────────
  try {
    blobUrl = await kv.get(`undangan:${slug}`);
  } catch (e) {
    console.error("KV lookup error (non-fatal):", e);
  }

  // ── 2. Fallback ke Supabase ────────────────────────────────────────
  if (!blobUrl) {
    const SB_URL = process.env.SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_ANON_KEY;
    if (SB_URL && SB_KEY) {
      try {
        const sbRes = await fetch(
          `${SB_URL}/rest/v1/invitations?slug=eq.${encodeURIComponent(slug)}&select=blob_url&limit=1`,
          { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
        );
        const rows = await sbRes.json();
        blobUrl = rows[0]?.blob_url;
      } catch (e) {
        console.error("Supabase lookup error:", e);
      }
    }
  }

  // ── 3. Fallback cari langsung di Vercel Blob ──────────────────────
  //     (berguna jika KV & Supabase belum dikonfigurasi)
  if (!blobUrl) {
    try {
      const { blobs } = await list({ prefix: `undangan/${slug}` });
      const match = blobs.find(b => b.pathname === `undangan/${slug}.html`);
      if (match) blobUrl = match.url;
    } catch (e) {
      console.error("Blob list fallback error:", e);
    }
  }

  if (!blobUrl) {
    return res.status(404).send(`<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"><title>Undangan Tidak Ditemukan</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#DCE9FF;color:#0D1B3E;text-align:center;padding:20px}h2{font-size:1.4rem;margin-bottom:8px}p{color:#7B90BB;font-size:.9rem}a{margin-top:18px;padding:11px 24px;background:#1A6BFF;color:#fff;border-radius:12px;text-decoration:none;font-weight:700}</style>
</head><body>
<div style="font-size:3rem;margin-bottom:16px">💌</div>
<h2>Undangan tidak ditemukan</h2>
<p>Link undangan tidak valid atau sudah kedaluwarsa.</p>
<a href="https://kutemo.id">← Kembali ke Kutemo</a>
</body></html>`);
  }

  // ── Ambil HTML dari Blob dan serve ─────────────────────────────────
  try {
    const blobRes = await fetch(blobUrl);
    if (!blobRes.ok) return res.status(404).send("Undangan tidak tersedia");
    let html = await blobRes.text();

    // ── Transformasi saat serve: pastikan ucapan selalu berfungsi ──────
    // Blob undangan adalah snapshot template saat dibuat, jadi perbaikan
    // runtime (fitur ucapan) disuntikkan di sini agar undangan LAMA juga
    // ikut ter-update tanpa perlu regenerate.
    html = injectUcapan(html, slug);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.send(html);
  } catch (e) {
    console.error("Blob fetch error:", e);
    return res.status(500).send("Gagal memuat undangan");
  }
}

/* ── Injeksi ucapan universal (serve-time) ─────────────────────────────
 * Berfungsi untuk semua tema. Menyuntikkan script yang:
 *  - Mencegat submit form RSVP di fase capture → menyimpan ke /api/ucapan
 *  - Menampilkan daftar ucapan (memakai container bawaan tema bila ada,
 *    atau membuat container baru di atas form bila tidak ada)
 *  - Menjaga idempoten (guard window.__ktmUcapan) agar tidak dobel
 */
function injectUcapan(html, slug) {
  const safeSlug = (slug || '').replace(/[^a-z0-9-]/gi, '');
  if (!safeSlug) return html;

  // Halaman yang sudah punya handler ucapan BAWAAN TIDAK perlu disuntik
  // lagi — injeksi dobel membuat beberapa handler submit bertabrakan.
  //  - window.submitRSVP=  → generate-invitation 13c sudah me-override
  //  - RSVP_SLUG=          → template modern (Seri Melayu dkk) sudah handle
  //  - _ktmSlug            → generate-invitation selalu set; tema submitRSVP
  //                          di-handle oleh 13c. (TIDAK dijadikan kondisi mati
  //                          karena hampir semua undangan punya ini.)
  if (
    /window\.submitRSVP\s*=/.test(html) ||
    /RSVP_SLUG\s*=/.test(html)
  ) {
    return html;
  }

  const SCRIPT = `
<script>
/* KTM ucapan universal — disuntikkan saat serve agar semua undangan ter-update */
(function(){
  if(window.__ktmUcapan){return;}window.__ktmUcapan=true;
  var SLUG=${JSON.stringify(safeSlug)};
  if(!SLUG){return;}
  var API='/api/ucapan?slug='+encodeURIComponent(SLUG);
  var busy={};
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function ago(iso){try{var d=Math.floor((Date.now()-new Date(iso))/60000);if(d<1)return'Baru saja';if(d<60)return d+'m lalu';var h=Math.floor(d/60);if(h<24)return h+'j lalu';return Math.floor(h/24)+'h lalu';}catch(e){return'';}}
  function findName(form){
    var ids=['rsvp-name','rsvpName','rsvp_nama','rsvp-nama','nama','wishName','guestName','commentName','fullName','fullname','name'];
    var el=null;for(var i=0;i<ids.length;i++){el=form.querySelector('#'+ids[i]+',[name="'+ids[i]+'"]');if(el)return el;}
    return form.querySelector('input[type="text"],input:not([type])')||null;
  }
  function findMsg(form){
    var ids=['rsvp-msg-input','rsvpMsg','rsvpWish','rsvp-message','rsvp_message','rsvp-ucapan','wishMsg','guestMessage','commentMsg','message','pesan','msg','ucapan'];
    var el=null;for(var i=0;i<ids.length;i++){el=form.querySelector('#'+ids[i]+',[name="'+ids[i]+'"]');if(el)return el;}
    return form.querySelector('textarea')||null;
  }
  function findAttend(form){
    var chk=form.querySelector('input[name="attendance"]:checked');if(chk)return chk.value;
    chk=form.querySelector('input[name="attend"]:checked');if(chk)return chk.value;
    var sel=form.querySelector('#rsvpAttend,[name="attendance"],[name="attend"]');if(sel)return sel.value||'hadir';
    if(typeof window.selectedAttend==='string'&&window.selectedAttend)return window.selectedAttend;
    if(typeof window.attendance==='string')return window.attendance;
    return'hadir';
  }
  function looksLikeRsvp(form){
    if(!form||form.tagName!=='FORM')return false;
    if(/rsvp|wish|comment|ucapan|guest|hadir|kehadiran/i.test(form.id||''))return true;
    if(findName(form))return true;
    return false;
  }
  function findList(){
    var ids=['comments-list','wishesList','guestbook-list','commentsList','wishList','guestbookList','ucapan-list','ucapanList'];
    var el=null;for(var i=0;i<ids.length;i++){el=document.getElementById(ids[i]);if(el)return el;}
    var all=document.querySelectorAll('[class*="wish"],[class*="comment"],[class*="guestbook"],[class*="ucapan"]');
    for(var j=0;j<all.length;j++){var c=all[j];if(c.tagName==='DIV'&&!c.querySelector('input,textarea'))return c;}
    return null;
  }
  function getOrMakeList(form){
    var el=findList();
    if(el)return el;
    if(document.getElementById('ktm-ucapan-list'))return document.getElementById('ktm-ucapan-list');
    var list=document.createElement('div');
    list.id='ktm-ucapan-list';
    list.style.cssText='margin:0 auto 26px;display:flex;flex-direction:column;gap:12px;max-height:320px;overflow:auto;padding:4px;';
    form.parentNode.insertBefore(list,form);
    return list;
  }
  function render(list,arr){
    var labels={hadir:'✅ Akan Hadir',tidak:'❌ Tidak Dapat Hadir',ragu:'🤔 Mungkin Hadir',mungkin:'🤔 Mungkin Hadir'};
    if(!arr||!arr.length){list.innerHTML='<div style="text-align:center;padding:22px;opacity:.55;font-size:13px;font-style:italic;font-family:Georgia,serif">Belum ada ucapan. Jadilah yang pertama 💌</div>';return;}
    list.innerHTML=arr.map(function(u){
      return'<div style="background:rgba(255,255,255,.75);border:1px solid rgba(200,162,74,.45);border-radius:10px;padding:13px 15px;text-align:left;font-family:Georgia,serif">'+
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">'+
        '<strong style="font-size:13px;letter-spacing:.5px;color:#4a1215">'+esc(u.nama)+'</strong>'+
        '<span style="font-size:10px;opacity:.6;white-space:nowrap;flex-shrink:0">'+ago(u.created_at)+'</span></div>'+
        (u.kehadiran?'<div style="font-size:11px;opacity:.7;margin:2px 0 4px">'+(labels[u.kehadiran]||esc(u.kehadiran))+'</div>':'')+
        (u.pesan?'<div style="font-size:13px;line-height:1.55;opacity:.9">'+esc(u.pesan)+'</div>':'')+
        '</div>';
    }).join('');
  }
  async function load(form){
    try{var r=await fetch(API);var d=await r.json();var list=getOrMakeList(form);if(list)render(list,Array.isArray(d)?d:[]);}catch(e){}
  }
  function toast(m){
    var t=document.createElement('div');
    t.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#6b1f23;color:#f0d98f;padding:12px 26px;border-radius:50px;font-size:13px;font-weight:700;z-index:999999;box-shadow:0 4px 20px rgba(0,0,0,.35);pointer-events:none;white-space:nowrap;font-family:sans-serif;transition:opacity .4s';
    t.textContent=m;document.body.appendChild(t);
    setTimeout(function(){t.style.opacity='0';setTimeout(function(){t.remove();},400);},2600);
  }
  document.addEventListener('submit',async function(e){
    var form=e.target;
    if(!looksLikeRsvp(form))return;
    if(busy[form.id||'f']){e.preventDefault();return;}
    var nameEl=findName(form),msgEl=findMsg(form);
    var name=(nameEl&&nameEl.value||'').trim();
    if(!name){e.preventDefault();toast('Mohon isi nama Anda');return;}
    var msg=(msgEl&&msgEl.value||'').trim();
    var attend=findAttend(form);
    e.preventDefault();
    e.stopPropagation();
    busy[form.id||'f']=true;
    var btn=form.querySelector('button[type="submit"]');if(btn){btn.disabled=true;btn.style.opacity='.55';}
    try{
      var r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nama:name,pesan:msg,kehadiran:attend})});
      if(r.ok){
        if(nameEl)nameEl.value='';if(msgEl)msgEl.value='';
        var chk=form.querySelector('input[type="radio"]:checked');if(chk)chk.checked=false;
        toast('🎉 Ucapan berhasil terkirim!');
        load(form);
      }else{toast('Maaf, ucapan gagal terkirim. Coba lagi.');}
    }catch(err){toast('Gangguan jaringan. Coba lagi.');}
    busy[form.id||'f']=false;
    if(btn){btn.disabled=false;btn.style.opacity='';}
  },true);
  function init(){
    var forms=document.querySelectorAll('form');
    for(var i=0;i<forms.length;i++){if(looksLikeRsvp(forms[i])){load(forms[i]);break;}}
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
  setInterval(function(){var forms=document.querySelectorAll('form');for(var i=0;i<forms.length;i++){if(looksLikeRsvp(forms[i])){load(forms[i]);break;}}},30000);
})();
</script>
`;
  if (html.includes('</body>')) {
    html = html.replace('</body>', SCRIPT + '\n</body>');
  }
  return html;
}
