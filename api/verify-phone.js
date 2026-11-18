// Vercel Serverless Function: DronieX Dual Phone Verification Engine (WhatsApp & SMS OTP)
// Path: /api/verify-phone

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'ok', service: 'DronieX Phone Verification API' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, phone, code, customerName } = req.body || {};
    const rawDigits = (phone || '').toString().replace(/[^0-9]/g, '');
    
    let targetPhone = rawDigits;
    if (rawDigits.startsWith('0')) targetPhone = '94' + rawDigits.substring(1);
    else if (!rawDigits.startsWith('94') && rawDigits.length === 9) targetPhone = '94' + rawDigits;

    if (!targetPhone || targetPhone.length < 11) {
      return res.status(400).json({ success: false, error: 'Please enter a valid 10-digit Sri Lankan mobile number.' });
    }

    const FIREBASE_BASE = 'https://droniex-rent-store-default-rtdb.asia-southeast1.firebasedatabase.app';

    // 1. ACTION: SEND OTP (SMS or WhatsApp)
    if (action === 'send_otp') {
      const generatedCode = code || Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      // Store in Firebase under /otps/[phone] (ephemeral verification cache)
      try {
        await fetch(`${FIREBASE_BASE}/otps/${targetPhone}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: generatedCode,
            phone: targetPhone,
            customerName: customerName || 'Customer',
            createdAt: new Date().toISOString(),
            expiresAt
          })
        });
      } catch (err) {
        console.warn('Firebase OTP cache error:', err);
      }

      // Check for Brevo SMS or WhatsApp if available
      let smsSent = false;
      let emailConfig = {};
      try {
        const emRes = await fetch(FIREBASE_BASE + '/config/email.json');
        if (emRes.ok) emailConfig = await emRes.json();
      } catch (e) {}

      const apiKey = emailConfig.apiKey || process.env.BREVO_API_KEY || '';
      if (apiKey && apiKey.startsWith('xkeysib-')) {
        try {
          const smsRes = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
            method: 'POST',
            headers: {
              'api-key': apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sender: 'DronieX',
              recipient: '+' + targetPhone,
              content: `Your DronieX rental booking verification code is: ${generatedCode}. Valid for 10 minutes.`
            })
          });
          smsSent = smsRes.ok;
        } catch (smsErr) {
          console.warn('Brevo SMS dispatch warning:', smsErr);
        }
      }

      // Generate direct WhatsApp link as fallback/alternative
      const waText = encodeURIComponent(`Hi DronieX, my rental booking verification code is *${generatedCode}* (Customer: ${customerName || 'Customer'}, Phone: +${targetPhone})`);
      const directWaUrl = `https://wa.me/94701875455?text=${waText}`;

      return res.status(200).json({
        success: true,
        phone: targetPhone,
        code: generatedCode,
        smsSent,
        directWaUrl,
        expiresInSeconds: 600
      });
    }

    // 2. ACTION: VERIFY OTP
    if (action === 'verify_otp') {
      const inputCode = (code || '').toString().trim();
      if (!inputCode) {
        return res.status(400).json({ success: false, error: 'Verification code is required.' });
      }

      let cached = null;
      try {
        const resFb = await fetch(`${FIREBASE_BASE}/otps/${targetPhone}.json`);
        if (resFb.ok) cached = await resFb.json();
      } catch (e) {}

      if (cached && cached.code === inputCode) {
        if (Date.now() > (cached.expiresAt || 0)) {
          return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new code.' });
        }

        // Clean up OTP
        try {
          await fetch(`${FIREBASE_BASE}/otps/${targetPhone}.json`, { method: 'DELETE' });
        } catch (e) {}

        return res.status(200).json({
          success: true,
          verified: true,
          phone: targetPhone,
          message: 'Phone number verified successfully!'
        });
      }

      return res.status(400).json({
        success: false,
        verified: false,
        error: 'Invalid verification code. Please check and try again.'
      });
    }

    return res.status(400).json({ success: false, error: 'Invalid action specified.' });
  } catch (err) {
    console.error('Verify Phone API error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
