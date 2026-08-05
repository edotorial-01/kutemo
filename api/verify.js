export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Supabase not configured' });

  const code = String((req.body || {}).code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ valid: false, error: 'Kode kosong' });

  const H = { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` };
  const q = encodeURIComponent(code);

  try {
    // Klaim kode secara atomik: hanya jika belum dipakai (status=paid) & pembayaran lunas
    const claim = await fetch(`${SB_URL}/rest/v1/orders?catatan=eq.${q}&payment_status=eq.paid&status=eq.paid`, {
      method: 'PATCH',
      headers: { ...H, 'Prefer': 'return=representation' },
      body: JSON.stringify({ status: 'completed' })
    });
    const claimed = await claim.json();
    if (Array.isArray(claimed) && claimed.length === 1) {
      return res.status(200).json({ valid: true, order_id: claimed[0].ref_id || null });
    }

    // Tidak terklaim → cek alasannya
    const lookup = await fetch(`${SB_URL}/rest/v1/orders?select=id,payment_status,status&catatan=eq.${q}`, { headers: H });
    const rows = await lookup.json();
    const order = Array.isArray(rows) ? rows[0] : null;
    if (!order) return res.status(200).json({ valid: false, error: 'Kode tidak valid' });
    if (order.payment_status !== 'paid') return res.status(200).json({ valid: false, error: 'Pembayaran belum dikonfirmasi admin' });
    if (order.status === 'completed') return res.status(200).json({ valid: false, error: 'Kode sudah digunakan' });
    return res.status(200).json({ valid: false, error: 'Kode tidak valid' });
  } catch (e) {
    console.error('verify handler error:', e);
    return res.status(500).json({ valid: false, error: 'Gagal memverifikasi', detail: String(e) });
  }
}
