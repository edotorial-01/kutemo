export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  const serverKey = process.env.MIDTRANS_SERVER_KEY;

  if (!clientKey || !serverKey) {
    return res.status(500).json({ error: 'Konfigurasi Midtrans belum lengkap' });
  }

  // Logika sama persis dengan create-transaction.js agar mode frontend
  // selalu sinkron dengan mode pembuatan token di backend.
  const isSandbox = serverKey.startsWith('SB-') || process.env.MIDTRANS_SANDBOX === 'true';

  return res.status(200).json({ client_key: clientKey, is_sandbox: isSandbox });
}
