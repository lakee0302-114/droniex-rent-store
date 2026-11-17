// Vercel Serverless Function: DronieX Multi-Channel Notification Engine
// Supports: Telegram Bot Alerts (Store Owner), Email Confirmations (Customer & Owner), WhatsApp Direct Links

function escapeTgHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'ok', service: 'DronieX Notification API' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      orderId,
      customerName,
      phone,
      whatsapp,
      email,
      customerPhone,
      gear,
      schedule,
      totalAmount,
      message,
      notifyAdmin,
      test,
      testTelegram,
      testEmail
    } = req.body || {};

    const FIREBASE_BASE = 'https://droniex-rent-store-default-rtdb.asia-southeast1.firebasedatabase.app';

    // 1. Fetch configs from Firebase
    let telegramConfig = {};
    let emailConfig = {};
    let waConfig = {};

    try {
      const [tgRes, emRes, waRes] = await Promise.all([
        fetch(FIREBASE_BASE + '/config/telegram.json'),
        fetch(FIREBASE_BASE + '/config/email.json'),
        fetch(FIREBASE_BASE + '/config/whatsapp.json')
      ]);
      if (tgRes.ok) telegramConfig = (await tgRes.json()) || {};
      if (emRes.ok) emailConfig = (await emRes.json()) || {};
      if (waRes.ok) waConfig = (await waRes.json()) || {};
    } catch (cfgErr) {
      console.warn('Config fetch error:', cfgErr);
    }

    let telegramSent = false;
    let telegramError = null;
    let emailSent = false;
    let emailError = null;

    // =========================================================================
    // 2. DISPATCH TELEGRAM ALERT TO STORE OWNER (100% Free Lifetime)
    // =========================================================================
    const tgBotToken = (telegramConfig.botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const tgChatId = (telegramConfig.chatId || process.env.TELEGRAM_CHAT_ID || '').toString().trim();
    const tgEnabled = telegramConfig.enabled !== false;

    if (tgBotToken && tgChatId && (tgEnabled || testTelegram)) {
      if (testTelegram) {
        try {
          const testMsg =
            `✈️ <b>DronieX Telegram Alert Test!</b>\n\n` +
            `Your automated store notification bot is <b>100% operational</b> and connected to DronieX Rent Store — Galle. 🚁\n\n` +
            `• <i>Store:</i> No. 131, D.J. Wimalasurendra Mawatha, Galwadugoda, Galle\n` +
            `• <i>Hotline:</i> 070 187 5455\n` +
            `• <i>Timestamp:</i> ${new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}`;

          const tgRes = await fetch(`https://api.telegram.org/bot${encodeURIComponent(tgBotToken)}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: tgChatId,
              text: testMsg,
              parse_mode: 'HTML',
              disable_web_page_preview: true
            })
          });
          const tgData = await tgRes.json();
          telegramSent = Boolean(tgData && tgData.ok);
          if (!telegramSent) telegramError = tgData.description || 'Telegram API returned error';
        } catch (tgErr) {
          telegramError = tgErr.message;
        }
      } else if (notifyAdmin || test) {
        try {
          const cPhone = customerPhone || phone || '—';
          const cWa = whatsapp || phone || '—';
          const tgOrderText =
            `🚨 <b>NEW ONLINE RESERVATION RECEIVED!</b> 🚁\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 <b>Order ID:</b> <code>${escapeTgHtml(orderId || 'New')}</code>\n` +
            `👤 <b>Customer:</b> ${escapeTgHtml(customerName || 'Customer')}\n` +
            `📞 <b>Phone:</b> ${escapeTgHtml(cPhone)}\n` +
            `💬 <b>WhatsApp:</b> ${escapeTgHtml(cWa)}\n` +
            (email ? `✉️ <b>Email:</b> ${escapeTgHtml(email)}\n` : '') +
            `📦 <b>Gear:</b> ${escapeTgHtml(gear || 'Equipment')}\n` +
            `📅 <b>Schedule:</b> ${escapeTgHtml(schedule || 'Upcoming')}\n` +
            `💰 <b>Total Amount:</b> Rs. ${totalAmount ? Number(totalAmount).toLocaleString('en-LK') : '—'}\n` +
            `💳 <b>Payment Method:</b> Pay at Store Pickup\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `📍 <i>Store: Galwadugoda, Galle (Hotline: 070 187 5455)</i>\n` +
            `👉 <a href="https://droniex-rent-store.vercel.app/admin.html">Open Admin Portal</a>`;

          const tgRes = await fetch(`https://api.telegram.org/bot${encodeURIComponent(tgBotToken)}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: tgChatId,
              text: tgOrderText,
              parse_mode: 'HTML',
              disable_web_page_preview: true
            })
          });
          const tgData = await tgRes.json();
          telegramSent = Boolean(tgData && tgData.ok);
          if (!telegramSent) telegramError = tgData.description;
        } catch (tgErr) {
          telegramError = tgErr.message;
        }
      }
    }

    // =========================================================================
    // 3. DISPATCH EMAIL CONFIRMATION (Brevo or Resend)
    // =========================================================================
    const emailApiKey = (emailConfig.apiKey || process.env.EMAIL_API_KEY || process.env.BREVO_API_KEY || process.env.RESEND_API_KEY || '').trim();
    const storeEmail = (emailConfig.storeEmail || 'lakditha2008@gmail.com').trim();
    const emailEnabled = emailConfig.enabled !== false;
    const targetCustomerEmail = (email || '').trim();

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

      // Check if Brevo (api-key starts with xkeysib or provider is brevo)
      if (emailApiKey.startsWith('xkeysib-') || emailConfig.provider === 'brevo') {
        try {
          const recipients = [];
          if (targetCustomerEmail) recipients.push({ email: targetCustomerEmail, name: customerName || 'Customer' });
          if (testEmail || !targetCustomerEmail) recipients.push({ email: storeEmail, name: 'Store Owner' });

          const bRes = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'api-key': emailApiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              sender: { name: 'DronieX Rent Store', email: storeEmail || 'droniex.rent@gmail.com' },
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
      } else {
        // Resend
        try {
          const toList = testEmail ? [storeEmail] : [targetCustomerEmail || storeEmail];
          const rRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${emailApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'DronieX Store <onboarding@resend.dev>',
              to: toList,
              subject: testEmail ? '✈️ DronieX Email Service Test' : `DronieX Equipment Rental Confirmation [${orderId || 'Booking'}]`,
              html: emailHtml
            })
          });
          emailSent = rRes.ok;
          if (!emailSent) {
            const rData = await rRes.json();
            emailError = JSON.stringify(rData);
          }
        } catch (rErr) {
          emailError = rErr.message;
        }
      }
    }

    // Direct WhatsApp URLs (100% Free fallback)
    const directStoreWaUrl = `https://wa.me/94701875455?text=${encodeURIComponent(message || 'Hello DronieX Store')}`;
    const directCustomerWaUrl = phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message || '')}` : '';

    return res.status(200).json({
      success: Boolean(telegramSent || emailSent || testTelegram || testEmail),
      telegramSent,
      telegramError,
      emailSent,
      emailError,
      orderId: orderId || '',
      directStoreWaUrl,
      directCustomerWaUrl,
      message: telegramSent ? 'Owner alerted via Telegram' : 'Notification processed'
    });
  } catch (err) {
    console.error('Notification dispatch error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
