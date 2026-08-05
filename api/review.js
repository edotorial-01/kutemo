export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // GET: ambil daftar review
  if (req.method === 'GET') {
    if (!SB_URL || !SB_KEY) {
      return res.status(200).json([]);
    }
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/reviews?select=*&order=created_at.desc&limit=20`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      const data = await r.json();
      return res.status(200).json(Array.isArray(data) ? data : []);
    } catch (e) {
      return res.status(200).json([]);
    }
  }

  // POST: simpan review
  if (req.method === 'POST') {
    const { rating, komentar, nama, order_id } = req.body || {};
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating wajib 1-5' });
    }
    if (!komentar || !komentar.trim()) {
      return res.status(400).json({ error: 'Komentar wajib diisi' });
    }

    if (!SB_URL || !SB_KEY) {
      return res.status(200).json({ ok: true, offline: true });
    }

    try {
      await fetch(`${SB_URL}/rest/v1/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          rating: Math.min(5, Math.max(1, parseInt(rating))),
          komentar: komentar.trim(),
          nama: nama || 'Pengguna Kutemo',
          order_id: order_id || null,
        }),
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: 'Gagal menyimpan review' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
