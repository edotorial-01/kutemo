export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { product, customer } = req.body || {};

  if (!product?.id || !product?.name || !product?.price) {
    return res.status(400).json({ error: 'Data produk tidak lengkap' });
  }
  if (!customer?.nama || !customer?.wa) {
    return res.status(400).json({ error: 'Nama dan nomor WhatsApp wajib diisi' });
  }

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    return res.status(500).json({ error: 'Server key belum dikonfigurasi' });
  }

  const isSandbox = serverKey.startsWith('SB-');
  const apiUrl = isSandbox
    ? 'https://app.sandbox.midtrans.com/snap/v1/transactions'
    : 'https://app.midtrans.com/snap/v1/transactions';

  const auth = Buffer.from(serverKey + ':').toString('base64');
  const orderId = 'KTM-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();

  const payload = {
    transaction_details: {
      order_id: orderId,
      gross_amount: product.price
    },
    customer_details: {
      first_name: customer.nama,
      phone: customer.wa
    },
    item_details: [{
      id: String(product.id),
      price: product.price,
      quantity: 1,
      name: product.name.substring(0, 50)
    }]
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + auth
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Midtrans error:', data);
      return res.status(response.status).json({ error: 'Gagal membuat transaksi', detail: data });
    }

    return res.status(200).json({ token: data.token, order_id: orderId });
  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Gagal menghubungi Midtrans' });
  }
}
