// Vercel Serverless Function: Automated WhatsApp Messaging (UltraMsg + CallMeBot Gateway)
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
    const { phone, whatsapp, message, orderId, test, notifyAdmin, customerName, customerPhone, gear, totalAmount } = req.body || {};

    const targetInput = (whatsapp || phone || '').toString().trim();
    if (!targetInput || !message) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }

    // 1. Fetch WhatsApp Gateway credentials from Firebase Realtime Database
    const FIREBASE_CONFIG_URL = 'https://droniex-rent-store-default-rtdb.asia-southeast1.firebasedatabase.app/config/whatsapp.json';
    let instanceId = process.env.ULTRAMSG_INSTANCE_ID || '';
    let token = process.env.ULTRAMSG_TOKEN || '';
    let callmebotKey = process.env.CALLMEBOT_API_KEY || '';
    let adminAlertPhone = '0740309322';
    let enabled = true;

    try {
      const fbRes = await fetch(FIREBASE_CONFIG_URL);
      if (fbRes.ok) {
        const config = await fbRes.json();
        if (config) {
          if (config.instanceId) instanceId = config.instanceId.trim();
          if (config.token) token = config.token.trim();
          if (config.callmebotKey) callmebotKey = config.callmebotKey.toString().trim();
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

    // 2. Format Sri Lankan phone number for customer WhatsApp (e.g. 947XXXXXXXX)
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

    let contactDetailsText = `📞 *Contact (Phone & WA):* +${targetPhone}\n`;
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
      `💰 *Total Amount:* Rs. ${totalAmount ? Number(totalAmount).toLocaleString('en-LK') : '—'}\n` +
      `💳 *Payment Method:* Pay at Store\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👉 *Admin Portal:* https://droniex-rent-store.vercel.app/admin.html`;

    // 3. Dispatch to CallMeBot (100% Free Lifetime WhatsApp alert for store owner)
    let callmebotSent = false;
    let callmebotResult = null;
    if ((notifyAdmin || test) && callmebotKey) {
      try {
        const cmbPhone = storeAdminPhone.startsWith('+') ? storeAdminPhone : '+' + storeAdminPhone;
        const cmbTextToSend = test ? message : adminBody;
        const cmbUrl = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(cmbPhone)}&text=${encodeURIComponent(cmbTextToSend)}&apikey=${encodeURIComponent(callmebotKey)}`;
        const cmbRes = await fetch(cmbUrl);
        const cmbText = await cmbRes.text();
        callmebotSent = cmbRes.ok;
        callmebotResult = cmbText;
        console.log('CallMeBot result:', cmbRes.status, cmbText);
      } catch (cmbErr) {
        console.warn('CallMeBot dispatch error:', cmbErr);
      }
    }

    // 4. Dispatch to UltraMsg (if instanceId and token are configured)
    let ultraResult = null;
    let adminResult = null;
    let ultraSent = false;

    if (instanceId && token) {
      let cleanInstanceId = instanceId.replace(/[^a-zA-Z0-9]/g, '');
      if (!cleanInstanceId.toLowerCase().startsWith('instance')) {
        cleanInstanceId = 'instance' + cleanInstanceId;
      }
      const ultraUrl = `https://api.ultramsg.com/${cleanInstanceId}/messages/chat`;

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
      } catch (uErr) {
        console.warn('UltraMsg customer dispatch error:', uErr);
      }

      if (notifyAdmin) {
        try {
          const adminParams = new URLSearchParams();
          adminParams.append('token', token);
          adminParams.append('to', storeAdminPhone);
          adminParams.append('body', adminBody);

          const adminRes = await fetch(ultraUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: adminParams.toString()
          });
          adminResult = await adminRes.json();
        } catch (adminErr) {
          console.warn('UltraMsg admin notification error:', adminErr);
        }
      }
    }

    const directStoreWaUrl = `https://wa.me/94701875455?text=${encodeURIComponent(message)}`;
    const directCustomerWaUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;

    if (ultraSent || callmebotSent) {
      return res.status(200).json({
        success: true,
        ultraSent,
        callmebotSent,
        orderId: orderId || '',
        targetPhone,
        adminPhone: storeAdminPhone,
        directStoreWaUrl,
        directCustomerWaUrl
      });
    }

    // If neither gateway sent, return helpful details along with direct 1-click WhatsApp URLs
    return res.status(200).json({
      success: false,
      reason: ultraResult?.error ? 'gateway_expired_or_stopped' : 'no_gateway_active',
      details: ultraResult || 'UltraMsg stopped / CallMeBot not configured',
      callmebotSent,
      directStoreWaUrl,
      directCustomerWaUrl,
      targetPhone
    });
  } catch (err) {
    console.error('send-whatsapp error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
