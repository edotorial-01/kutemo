export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Supabase not configured' });

  const { order_id, nama, wa, email: email2, pria, wanita, tema, total } = req.body || {};
  if (!order_id || !nama || !wa || !tema || !total) {
    return res.status(400).json({ error: 'Data order tidak lengkap' });
  }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        ref_id: order_id,
        nama_pemesan: nama,
        email: String(email2 || ''),
        whatsapp: wa,
        nama_mempelai: [pria, wanita].filter(Boolean).join(' & '),
        tema,
        total_bayar: Number(total) || 0,
        metode_bayar: 'qris',
        payment_status: 'pending',
        status: 'pending'
      })
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error('order insert error:', r.status, txt);
      return res.status(r.status).json({ error: 'Gagal menyimpan order', detail: txt });
    }
    return res.status(201).json({ ok: true, order_id });
  } catch (e) {
    console.error('order handler error:', e);
    return res.status(500).json({ error: 'Gagal menyimpan order', detail: String(e) });
  }
}
