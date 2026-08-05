export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const slug = (req.query.slug || '').trim();
  if (!slug) return res.status(400).json({ error: 'slug required' });

  const SB  = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_ANON_KEY;
  if (!SB || !KEY) return res.status(503).json({ error: 'Supabase not configured' });

  /* GET — ambil semua ucapan untuk slug ini */
  if (req.method === 'GET') {
    try {
      const r = await fetch(
        `${SB}/rest/v1/ucapan?slug=eq.${encodeURIComponent(slug)}&order=created_at.desc&limit=100`,
        { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
      );
      const data = await r.json();
      return res.json(Array.isArray(data) ? data : []);
    } catch (e) {
      return res.status(500).json({ error: 'Gagal mengambil ucapan' });
    }
  }

  /* POST — kirim ucapan baru */
  if (req.method === 'POST') {
    const { nama, pesan, kehadiran } = req.body || {};
    if (!nama || !nama.trim()) return res.status(400).json({ error: 'nama wajib diisi' });
    try {
      const r = await fetch(`${SB}/rest/v1/ucapan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          slug,
          nama: nama.trim(),
          pesan: (pesan || '').trim(),
          kehadiran: kehadiran || 'hadir',
        }),
      });
      if (!r.ok) return res.status(500).json({ error: 'Gagal menyimpan ucapan' });
      return res.status(201).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
