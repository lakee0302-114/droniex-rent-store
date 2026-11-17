// Vercel Serverless Function: Automated WhatsApp Messaging (UltraMsg Gateway + Telegram Fallback)
// Path: /api/send-whatsapp

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'ok', service: 'DronieX WhatsApp Gateway API' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      phone,
      whatsapp,
      message,
      orderId,
      test,
      notifyAdmin,
      customerName,
      customerPhone,
      gear,
      schedule,
      totalAmount
    } = req.body || {};

    const targetInput = (whatsapp || phone || '').toString().trim();
    if (!targetInput && !test) {
      return res.status(400).json({ error: 'Phone or WhatsApp number is required' });
    }

    const FIREBASE_BASE = 'https://droniex-rent-store-default-rtdb.asia-southeast1.firebasedatabase.app';
    let instanceId = process.env.ULTRAMSG_INSTANCE_ID || '';
    let token = process.env.ULTRAMSG_TOKEN || '';
    let adminAlertPhone = '0740309322';
    let enabled = true;

    try {
      const fbRes = await fetch(FIREBASE_BASE + '/config/whatsapp.json');
      if (fbRes.ok) {
        const config = await fbRes.json();
        if (config) {
          if (config.instanceId) instanceId = config.instanceId.trim();
          if (config.token) token = config.token.trim();
          if (config.enabled !== undefined) enabled = Boolean(config.enabled);
          if (config.adminAlertPhone) adminAlertPhone = config.adminAlertPhone.toString().trim();
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

    // Format Sri Lankan phone number for customer WhatsApp (e.g. 947XXXXXXXX)
    const rawDigits = targetInput.replace(/[^0-9]/g, '');
    let targetPhone = rawDigits;
    if (rawDigits.startsWith('0')) targetPhone = '94' + rawDigits.substring(1);
    else if (!rawDigits.startsWith('94') && rawDigits.length === 9) targetPhone = '94' + rawDigits;

    // Format calling phone for store admin alert reference
    let callingPhoneFormatted = '';
    if (customerPhone) {
      const cDigits = customerPhone.toString().replace(/[^0-9]/g, '');
      if (cDigits.startsWith('0')) callingPhoneFormatted = '94' + cDigits.substring(1);
      else if (!cDigits.startsWith('94') && cDigits.length === 9) callingPhoneFormatted = '94' + cDigits;
      else callingPhoneFormatted = cDigits;
    }

    let storeAdminPhone = (adminAlertPhone || '0740309322').toString().replace(/[^0-9]/g, '');
    if (storeAdminPhone.startsWith('0')) storeAdminPhone = '94' + storeAdminPhone.substring(1);
    else if (!storeAdminPhone.startsWith('94') && storeAdminPhone.length === 9) storeAdminPhone = '94' + storeAdminPhone;

    let contactDetailsText = `📞 *Contact (Phone & WA):* +${targetPhone || storeAdminPhone}\n`;
    if (callingPhoneFormatted && callingPhoneFormatted !== targetPhone) {
      contactDetailsText =
        `📞 *Calling Phone:* +${callingPhoneFormatted}\n` +
        `💬 *WhatsApp Number:* +${targetPhone}\n`;
    }

    const adminBody =
      `🚨 *NEW ONLINE RESERVATION RECEIVED!* 🚁\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *Order ID:* ${orderId || 'New'}\n` +
      `👤 *Customer:* ${customerName || 'Customer'}\n` +
      contactDetailsText +
      `📦 *Gear:* ${gear || 'Equipment'}\n` +
      `📅 *Schedule:* ${schedule || 'Upcoming'}\n` +
      `💰 *Total Amount:* Rs. ${totalAmount ? Number(totalAmount).toLocaleString('en-LK') : '—'}\n` +
      `💳 *Payment Method:* Pay at Store Pickup\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 *Store Pickup: Galwadugoda, Galle (Hotline: 070 187 5455)*\n` +
      `👉 *Admin Portal:* https://droniex-rent-store.vercel.app/admin.html`;

    // 1. Dispatch to UltraMsg (WhatsApp Gateway)
    let ultraResult = null;
    let adminResult = null;
    let ultraSent = false;
    let ultraError = null;

    if (instanceId && token) {
      let cleanInstanceId = instanceId.replace(/[^a-zA-Z0-9]/g, '');
      if (!cleanInstanceId.toLowerCase().startsWith('instance')) {
        cleanInstanceId = 'instance' + cleanInstanceId;
      }
      const ultraUrl = `https://api.ultramsg.com/${cleanInstanceId}/messages/chat`;

      // Customer dispatch
      if (targetPhone && message) {
        try {
          const params = new URLSearchParams();
          params.append('token', token);
          params.append('to', targetPhone);
          params.append('body', message);

          const ultraRes = await fetch(ultraUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
          });
          ultraResult = await ultraRes.json();
          ultraSent = Boolean(ultraResult && (ultraResult.sent === 'true' || ultraResult.sent === true || ultraResult.id || ultraResult.message === 'ok'));
          if (!ultraSent && ultraResult && ultraResult.error) {
            ultraError = ultraResult.error;
          }
        } catch (uErr) {
          ultraError = uErr.message;
        }
      }

      // Store Owner WhatsApp Alert dispatch
      if (notifyAdmin || test) {
        try {
          const adminParams = new URLSearchParams();
          adminParams.append('token', token);
          adminParams.append('to', storeAdminPhone);
          adminParams.append('body', test ? (message || 'Hello from DronieX WhatsApp Gateway!') : adminBody);

          const adminRes = await fetch(ultraUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: adminParams.toString()
          });
          adminResult = await adminRes.json();
          const adminSent = Boolean(adminResult && (adminResult.sent === 'true' || adminResult.sent === true || adminResult.id || adminResult.message === 'ok'));
          if (adminSent) ultraSent = true;
          if (!adminSent && adminResult && adminResult.error) {
            ultraError = adminResult.error;
          }
        } catch (adminErr) {
          console.warn('UltraMsg admin dispatch error:', adminErr);
        }
      }
    }

    // Direct WhatsApp URLs (100% Free fallback)
    const directStoreWaUrl = `https://wa.me/94701875455?text=${encodeURIComponent(message || adminBody)}`;
    const directCustomerWaUrl = targetPhone ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(message || '')}` : '';

    if (ultraSent) {
      return res.status(200).json({
        success: true,
        ultraSent: true,
        orderId: orderId || '',
        targetPhone,
        adminPhone: storeAdminPhone,
        directStoreWaUrl,
        directCustomerWaUrl,
        message: 'WhatsApp message dispatched successfully via UltraMsg!'
      });
    }

    return res.status(200).json({
      success: false,
      reason: ultraError ? 'gateway_error' : 'no_gateway_configured',
      details: ultraResult || adminResult || ultraError || 'UltraMsg instance ID & Token not active',
      directStoreWaUrl,
      directCustomerWaUrl,
      targetPhone,
      adminPhone: storeAdminPhone
    });
  } catch (err) {
    console.error('WhatsApp API error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
