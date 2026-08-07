export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const orderId = (req.query.order_id || req.body?.order_id || '').trim();
  if (!orderId) return res.status(400).json({ error: 'order_id wajib diisi' });

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return res.status(500).json({ error: 'Server key belum dikonfigurasi' });

  const isSandbox = serverKey.startsWith('SB-') || process.env.MIDTRANS_SANDBOX === 'true';
  const base = isSandbox ? 'https://api.sandbox.midtrans.com/v2' : 'https://api.midtrans.com/v2';
  const auth = Buffer.from(serverKey + ':').toString('base64');

  try {
    const r = await fetch(`${base}/${encodeURIComponent(orderId)}/status`, {
      headers: { 'Accept': 'application/json', 'Authorization': 'Basic ' + auth }
    });
    const data = await r.json();

    if (!r.ok) {
      console.error('Midtrans status error:', r.status, data);
      return res.status(r.status).json({ error: 'Gagal mengambil status', detail: data });
    }

    return res.status(200).json({
      order_id: data.order_id || orderId,
      transaction_status: data.transaction_status || null,
      status_code: data.status_code || null,
      fraud_status: data.fraud_status || null,
      payment_type: data.payment_type || null,
      gross_amount: data.gross_amount || null,
      transaction_time: data.transaction_time || null,
      settlement_time: data.settlement_time || null,
      is_sandbox: isSandbox
    });
  } catch (e) {
    console.error('Status fetch error:', e);
    return res.status(500).json({ error: 'Gagal menghubungi Midtrans' });
  }
}
