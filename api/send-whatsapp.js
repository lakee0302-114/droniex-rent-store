// Vercel Serverless Function: DronieX Multi-Channel Notification Engine
// Supports: ntfy Silent Push Notifications (Phone Lock-Screen), UltraMsg WhatsApp, Brevo Email, Direct wa.me
// Path: /api/send-whatsapp

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'ok', service: 'DronieX Notification API' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      phone,
      whatsapp,
      email,
      message,
      orderId,
      test,
      testNtfy,
      testEmail,
      notifyAdmin,
      customerName,
      customerPhone,
      gear,
      schedule,
      totalAmount
    } = req.body || {};

    const targetInput = (whatsapp || phone || '').toString().trim();
    if (!targetInput && !test && !testNtfy && !testEmail) {
      return res.status(400).json({ error: 'Phone or WhatsApp number is required' });
    }

    const FIREBASE_BASE = 'https://droniex-rent-store-default-rtdb.asia-southeast1.firebasedatabase.app';
    let instanceId = process.env.ULTRAMSG_INSTANCE_ID || '';
    let token = process.env.ULTRAMSG_TOKEN || '';
    let adminAlertPhone = '0740309322';
    let waEnabled = true;
    let emailConfig = {};
    let ntfyConfig = {};

    try {
      const [waRes, emRes, ntRes] = await Promise.all([
        fetch(FIREBASE_BASE + '/config/whatsapp.json'),
        fetch(FIREBASE_BASE + '/config/email.json'),
        fetch(FIREBASE_BASE + '/config/ntfy.json')
      ]);
      if (waRes.ok) {
        const config = await waRes.json();
        if (config) {
          if (config.instanceId) instanceId = config.instanceId.trim();
          if (config.token) token = config.token.trim();
          if (config.enabled !== undefined) waEnabled = Boolean(config.enabled);
          if (config.adminAlertPhone) adminAlertPhone = config.adminAlertPhone.toString().trim();
        }
      }
      if (emRes.ok) emailConfig = (await emRes.json()) || {};
      if (ntRes.ok) ntfyConfig = (await ntRes.json()) || {};
    } catch (fbErr) {
      console.warn('Firebase config fetch error:', fbErr);
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

    const isSound = (gear || '').toLowerCase().includes('jbl') ||
                    (gear || '').toLowerCase().includes('sound') ||
                    (gear || '').toLowerCase().includes('partybox') ||
                    (gear || '').toLowerCase().includes('mic');

    const alertIcon = isSound ? '🔊 🎵' : '🚁';

    const adminBody =
      `🚨 *NEW ONLINE RESERVATION RECEIVED!* ${alertIcon}\n` +
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

    // =========================================================================
    // 1. DISPATCH SILENT PHONE PUSH NOTIFICATION (ntfy.sh - 100% Free Lifetime)
    // =========================================================================
    let ntfySent = false;
    let ntfyError = null;
    const ntfyTopic = (ntfyConfig.topic || 'droniex_orders_0740309322').trim();
    const ntfyEnabled = ntfyConfig.enabled !== false;
    const ntfyPriority = (ntfyConfig.silent !== false) ? 'low' : 'default'; // low = silent (no sound, notifications only)

    if (ntfyTopic && (ntfyEnabled || testNtfy)) {
      try {
        const ntfyTitle = testNtfy
          ? 'DronieX Silent Phone Alert Test'
          : (isSound ? `New Sound Order: ${orderId || 'Reservation'}` : `New Order: ${orderId || 'Reservation'}`);
        const cPhone = customerPhone || phone || '—';
        const ntfyBody = testNtfy
          ? 'Helo Lakditha! Your silent phone notification system is 100% connected to DronieX Store. You will receive lock-screen alerts for every booking.'
          : `📋 Order: ${orderId || 'New'}\n👤 Customer: ${customerName || 'Customer'}\n📞 Contact: ${cPhone}\n📦 Gear: ${gear || 'Equipment'}\n💰 Fee: Rs. ${totalAmount ? Number(totalAmount).toLocaleString('en-LK') : '—'}\n📅 Dates: ${schedule || 'Upcoming'}`;

        const ntfyRes = await fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic)}`, {
          method: 'POST',
          headers: {
            'Title': ntfyTitle,
            'Priority': ntfyPriority,
            'Tags': isSound ? 'bell_slash,loudspeaker' : 'bell_slash,package',
            'Click': 'https://droniex-rent-store.vercel.app/admin.html'
          },
          body: ntfyBody
        });
        ntfySent = ntfyRes.ok;
      } catch (nErr) {
        ntfyError = nErr.message;
      }
    }

    if (testNtfy) {
      return res.status(200).json({
        success: ntfySent,
        ntfySent,
        ntfyTopic,
        ntfyError: ntfyError || (ntfySent ? null : 'Failed to post to ntfy')
      });
    }

    // =========================================================================
    // 2. DISPATCH TO ULTRAMSG (WHATSAPP GATEWAY)
    // =========================================================================
    let ultraResult = null;
    let adminResult = null;
    let ultraSent = false;
    let ultraError = null;

    if (instanceId && token && (waEnabled || test)) {
      let cleanInstanceId = instanceId.replace(/[^a-zA-Z0-9]/g, '');
      if (!cleanInstanceId.toLowerCase().startsWith('instance')) {
        cleanInstanceId = 'instance' + cleanInstanceId;
      }
      const ultraUrl = `https://api.ultramsg.com/${cleanInstanceId}/messages/chat`;

      // Customer dispatch
      if (targetPhone && message && !test) {
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

    // =========================================================================
    // 3. DISPATCH EMAIL CONFIRMATION (BREVO / RESEND)
    // =========================================================================
    let emailSent = false;
    let emailError = null;
    const emailApiKey = (emailConfig.apiKey || process.env.EMAIL_API_KEY || process.env.BREVO_API_KEY || '').trim();
    const storeEmail = (emailConfig.storeEmail || 'lakditha2008@gmail.com').trim();
    const emailEnabled = emailConfig.enabled !== false;
    const targetEmail = (email || '').trim();

    if (emailApiKey && (emailEnabled || testEmail)) {
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
          <div style="text-align: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px;">
            <h1 style="color: #0284c7; font-size: 22px; font-weight: 800; margin: 0;">DronieX Rent Store — Galle</h1>
            <p style="color: #64748b; font-size: 12px; margin-top: 4px;">Official Equipment Booking Confirmation</p>
          </div>

          <p style="font-size: 14px; line-height: 1.6;">Dear <strong>${customerName || 'Valued Customer'}</strong>,</p>
          <p style="font-size: 13px; line-height: 1.6; color: #475569;">Thank you for choosing DronieX! Your equipment reservation has been confirmed and logged in our store database.</p>

          <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin: 20px 0; font-size: 13px; line-height: 1.8;">
            <div><strong>📋 Tracking Reference ID:</strong> <span style="font-family: monospace; color: #0284c7; font-weight: bold;">${orderId || 'New'}</span></div>
            <div><strong>📦 Equipment Reserved:</strong> ${gear || 'Equipment'}</div>
            <div><strong>📅 Rental Period:</strong> ${schedule || 'Upcoming'}</div>
            <div><strong>💰 Total Rental Fee:</strong> <span style="color: #059669; font-weight: bold;">Rs. ${totalAmount ? Number(totalAmount).toLocaleString('en-LK') : '—'}</span></div>
            <div><strong>💳 Payment Method:</strong> Pay at Store Pickup</div>
          </div>

          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px; margin: 20px 0; font-size: 12px; line-height: 1.6; color: #166534;">
            <strong>📍 Store Pickup Location:</strong><br />
            No. 131, D.J. Wimalasurendra Mawatha, Galwadugoda, Galle 80000.<br />
            <strong>📞 Store Hotlines:</strong> 070 187 5455 / 071 351 0551<br />
            <em>Please present your Tracking ID and original NIC/Passport upon store pickup.</em>
          </div>

          <div style="text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; font-size: 11px; color: #94a3b8;">
            Track your order anytime online at <a href="https://droniex-rent-store.vercel.app" style="color: #0284c7; text-decoration: none;">droniex-rent-store.vercel.app</a>
          </div>
        </div>
      `;

      if (emailApiKey.startsWith('xkeysib-') || emailConfig.provider === 'brevo') {
        try {
          const recipients = [];
          if (targetEmail) recipients.push({ email: targetEmail, name: customerName || 'Customer' });
          if (testEmail || !targetEmail) recipients.push({ email: storeEmail, name: 'Store Owner' });

          const bRes = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'api-key': emailApiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              sender: { name: 'DronieX Rent Store', email: storeEmail || 'lakditha2008@gmail.com' },
              to: recipients,
              subject: testEmail ? '✈️ DronieX Email Service Test' : `DronieX Equipment Rental Confirmation [${orderId || 'Booking'}]`,
              htmlContent: emailHtml
            })
          });
          emailSent = bRes.ok;
          if (!emailSent) {
            const bData = await bRes.json();
            emailError = JSON.stringify(bData);
          }
        } catch (bErr) {
          emailError = bErr.message;
        }
      }
    }

    if (testEmail) {
      return res.status(200).json({
        success: emailSent,
        emailSent,
        emailError: emailError || (emailSent ? null : 'Failed to dispatch test email.')
      });
    }

    // Direct WhatsApp URLs (100% Free fallback)
    const directStoreWaUrl = `https://wa.me/94701875455?text=${encodeURIComponent(message || adminBody)}`;
    const directCustomerWaUrl = targetPhone ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(message || '')}` : '';

    return res.status(200).json({
      success: Boolean(ultraSent || emailSent || ntfySent),
      ultraSent,
      emailSent,
      ntfySent,
      orderId: orderId || '',
      targetPhone,
      adminPhone: storeAdminPhone,
      directStoreWaUrl,
      directCustomerWaUrl,
      message: 'Notification processing complete'
    });
  } catch (err) {
    console.error('Notification API error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
