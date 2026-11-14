// Vercel Serverless Function: Automated WhatsApp Messaging (UltraMsg Gateway)
// Path: /api/send-whatsapp

module.exports = async (req, res) => {
  // CORS support
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'DronieX WhatsApp Gateway API' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phone, message, orderId, test } = req.body || {};

    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }

    // 1. Fetch WhatsApp Gateway credentials from Firebase Realtime Database
    const FIREBASE_CONFIG_URL = 'https://droniex-rent-store-default-rtdb.asia-southeast1.firebasedatabase.app/config/whatsapp.json';
    let instanceId = process.env.ULTRAMSG_INSTANCE_ID || '';
    let token = process.env.ULTRAMSG_TOKEN || '';
    let enabled = true;

    try {
      const fbRes = await fetch(FIREBASE_CONFIG_URL);
      if (fbRes.ok) {
        const config = await fbRes.json();
        if (config) {
          if (config.instanceId) instanceId = config.instanceId.trim();
          if (config.token) token = config.token.trim();
          if (config.enabled !== undefined) enabled = Boolean(config.enabled);
        }
      }
    } catch (fbErr) {
      console.warn('Firebase config fetch error:', fbErr);
    }

    if (!enabled && !test) {
      return res.status(200).json({
        success: false,
        reason: 'disabled',
        message: 'WhatsApp auto-send is disabled in settings.'
      });
    }

    if (!instanceId || !token) {
      return res.status(200).json({
        success: false,
        reason: 'not_configured',
        message: 'WhatsApp gateway not configured. Please enter Instance ID and Token in Store Admin.'
      });
    }

    // 2. Format Sri Lankan phone number (e.g. 947XXXXXXXX)
    const rawDigits = phone.toString().replace(/[^0-9]/g, '');
    let targetPhone = rawDigits;
    if (rawDigits.startsWith('0')) targetPhone = '94' + rawDigits.substring(1);
    else if (!rawDigits.startsWith('94') && rawDigits.length === 9) targetPhone = '94' + rawDigits;

    // 3. Dispatch POST request to UltraMsg API
    const params = new URLSearchParams();
    params.append('token', token);
    params.append('to', targetPhone);
    params.append('body', message);

    const ultraUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;
    const ultraRes = await fetch(ultraUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const result = await ultraRes.json();

    if (result && (result.sent === 'true' || result.sent === true || result.id || result.message === 'ok')) {
      return res.status(200).json({
        success: true,
        provider: 'ultramsg',
        messageId: result.id,
        targetPhone: targetPhone,
        orderId: orderId || ''
      });
    } else {
      return res.status(200).json({
        success: false,
        reason: 'gateway_error',
        details: result,
        targetPhone: targetPhone
      });
    }
  } catch (err) {
    console.error('send-whatsapp error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
