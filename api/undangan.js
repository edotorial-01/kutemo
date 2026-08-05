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
    const html = await blobRes.text();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.send(html);
  } catch (e) {
    console.error("Blob fetch error:", e);
    return res.status(500).send("Gagal memuat undangan");
  }
}
