const { ObjectId } = require('mongodb');

const path = require('path');

const renderButton = (url, text) => `
<div style="text-align: center; margin: 35px 0 15px 0;">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="12%" stroke="f" fillcolor="#2563eb">
    <w:anchorlock/>
    <center>
  <![endif]-->
      <a href="${url}" style="background-color:#2563eb;border-radius:6px;color:#ffffff;display:inline-block;font-family:sans-serif;font-size:16px;font-weight:bold;line-height:50px;text-align:center;text-decoration:none;width:280px;-webkit-text-size-adjust:none;">${text}</a>
  <!--[if mso]>
    </center>
  </v:roundrect>
  <![endif]-->
</div>
`;

// Helfer-Funktion für Outlook-kompatibles HTML
const createBaseEmailHtml = (title, content) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #374151; line-height: 1.6; background-color: #f3f4f6; margin: 0; padding: 40px 20px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="800">
        <tr>
        <td style="padding: 35px; background-color: #ffffff;">
        <![endif]-->
        <table width="800" border="0" cellspacing="0" cellpadding="0" style="max-width: 800px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden;">
          <tr>
            <td style="padding: 35px;">
              <div style="text-align: center; margin-bottom: 25px; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px;">
                <img src="cid:matchlogo" alt="Match Logo" height="60" width="170" style="height: 60px; width: 170px; max-width: 100%; display: inline-block;">
                <h1 style="font-size: 24px; font-weight: 700; margin-top: 15px; margin-bottom: 0; color: #111827; text-align: left;">${title}</h1>
              </div>
              <div style="font-size: 16px; color: #374151;">
                ${content}
              </div>
              <div style="margin-top: 40px; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center;">
                Dies ist eine automatisch generierte Nachricht aus der Match Werkstatt-App.<br>
                Bitte antworten Sie nicht direkt auf diese E-Mail.
              </div>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
`;

/**
 * Sendet E-Mail an den Kunden, wenn der Auftrag zur Abnahme freigegeben wurde.
 */
async function sendWaitingConfirmationEmail(transporter, db, orderId, orderData, isReminder = false) {
  try {
    if (!orderData.clientId) {
      console.log(`[EMAIL] Keine clientId für Auftrag ${orderId} vorhanden.`);
      return;
    }
    
    let clientUser;
    try {
      clientUser = await db.collection('User').findOne({ _id: new ObjectId(orderData.clientId) });
    } catch (e) {
      console.error(`[EMAIL] Ungültige clientId: ${orderData.clientId}`);
      return;
    }
    
    if (!clientUser || !clientUser.email) {
      console.log(`[EMAIL] Kein Kunde oder keine E-Mail für Auftrag ${orderId} gefunden.`);
      return;
    }

    const components = await db.collection('Component').find({ orderId: orderId.toString() }).toArray();
    
    let componentsHtml = '';
    if (components && components.length > 0) {
      componentsHtml = `
        <table class="table">
          <thead>
            <tr>
              <th>Bauteil</th>
              <th>Anzahl</th>
            </tr>
          </thead>
          <tbody>
            ${components.map(c => `
              <tr>
                <td>${c.title || c.name || 'Unbenannt'}</td>
                <td>${c.quantity || 1}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      componentsHtml = '<p>Keine Bauteile hinterlegt.</p>';
    }

    const orderNumber = orderData.orderNumber || orderData._id || orderId;
    const createdAt = orderData.createdAt ? new Date(orderData.createdAt).toLocaleDateString('de-DE') : 'Unbekannt';
    const readyAt = new Date().toLocaleDateString('de-DE');

    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const orderLink = `${appUrl}/orders/${orderNumber}`;

    const html = createBaseEmailHtml(
      isReminder ? `Erinnerung: Ihr Auftrag ${orderNumber} ist abholbereit` : `Ihr Auftrag ${orderNumber} ist abholbereit`,
      `
      <p>Hallo ${clientUser.name || 'Kunde'},</p>
      <p>die Bauteile für Ihren Auftrag <strong>"${orderData.title}"</strong> wurden gefertigt und der Auftrag steht nun zur Endabnahme bereit.</p>
      <p>Bitte stimmen Sie sich mit der Werkstatt ab, um die Teile entgegenzunehmen und die Endabnahme in der Werkstatt-App zu bestätigen.</p>
      
      <h3>Auftragsdetails:</h3>
      <ul>
        <li><strong>Auftragsnummer:</strong> ${orderNumber}</li>
        <li><strong>Erstellt am:</strong> ${createdAt}</li>
        <li><strong>Fertiggestellt am:</strong> ${readyAt}</li>
      </ul>

      <h3>Bauteile in diesem Auftrag:</h3>
      ${componentsHtml}
      ${renderButton(orderLink, 'Auftrag in der App öffnen')}
      `
    );

    const targetEmails = await getWorkshopRecipients(db, orderData);

    const mailOptions = {
      from: process.env.SMTP_USER || 'werkstatt@uni-hannover.de',
      to: clientUser.email,
      cc: Array.from(targetEmails).join(','),
      subject: isReminder ? `Erinnerung: Endabnahme für Auftrag "${orderData.title}" erforderlich` : `Endabnahme für Auftrag "${orderData.title}" erforderlich`,
      html: html,
      attachments: [{
        filename: 'match_Logo_2023.png',
        path: path.join(__dirname, '../src/assets/match_Logo_2023.png'),
        cid: 'matchlogo' // same cid value as in the html img src
      }]
    };
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] Freigabe-E-Mail an Kunden gesendet: ${info.messageId}`);
  } catch (error) {
    console.error('[EMAIL] Fehler beim Senden der Kunden-E-Mail:', error);
  }
}

/**
 * Helper: Sammelt alle relevanten Werkstatt-Mitarbeiter (Zugewiesene oder Fallback auf Admins/Manager)
 */
async function getWorkshopRecipients(db, orderData) {
  const targetEmails = new Set();
  let workshopAssigned = false;

  if (orderData.assignedTo) {
    try {
      const assignedUser = await db.collection('User').findOne({ _id: new ObjectId(orderData.assignedTo) });
      if (assignedUser) {
        workshopAssigned = true;
        if (assignedUser.email) {
          targetEmails.add(assignedUser.email);
        }
      }
    } catch(e) { /* ignore */ }
  }

  if (orderData.subTasks && Array.isArray(orderData.subTasks)) {
    for (const task of orderData.subTasks) {
      if (task.assignedTo) {
        try {
          const taskUser = await db.collection('User').findOne({ _id: new ObjectId(task.assignedTo) });
          if (taskUser) {
            workshopAssigned = true;
            if (taskUser.email) {
              targetEmails.add(taskUser.email);
            }
          }
        } catch(e) { /* ignore */ }
      }
    }
  }

  if (!workshopAssigned) {
    const managersAdmins = await db.collection('User').find({ role: { $in: ['manager', 'admin'] } }).toArray();
    for (const user of managersAdmins) {
      if (user.email) targetEmails.add(user.email);
    }
  }

  return targetEmails;
}

/**
 * Sendet E-Mail an Werkstatt, wenn der Kunde abnimmt oder Nacharbeit fordert.
 */
async function sendWorkshopStatusUpdateEmail(transporter, db, orderId, orderData, newStatus, commentData) {
  try {
    const targetEmails = await getWorkshopRecipients(db, orderData);

    if (targetEmails.size === 0) {
      console.log(`[EMAIL] Keine Empfänger (Werkstatt) für Auftrag ${orderId} gefunden.`);
      return;
    }

    const orderNumber = orderData.orderNumber || orderData._id || orderId;
    const isCompleted = newStatus === 'completed';
    const statusText = isCompleted ? 'abgeschlossen (Endabnahme)' : 'zur Nacharbeit zurückgewiesen';
    
    const clientName = commentData?.userName || orderData.clientName || 'Kunde';
    const comment = commentData?.comment || 'Kein Kommentar hinterlegt';

    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const orderLink = `${appUrl}/orders/${orderNumber}`;

    const html = createBaseEmailHtml(
      `Auftrag ${orderNumber} wurde ${statusText}`,
      `
      <p>Hallo Werkstatt-Team,</p>
      <p>der Auftrag <strong>"${orderData.title}"</strong> wurde durch den Kunden (${clientName}) <strong>${statusText}</strong>.</p>
      
      <h3>Kommentar des Kunden:</h3>
      <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid ${isCompleted ? '#4CAF50' : '#FF9800'}; margin-bottom: 20px;">
        <em>"${comment}"</em>
      </div>

      ${renderButton(orderLink, 'Auftrag in der App öffnen')}
      `
    );

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: Array.from(targetEmails).join(','),
      subject: `[Werkstatt] Auftrag ${orderNumber}: ${isCompleted ? 'Abgenommen' : 'Nacharbeit'}`,
      html: html,
      attachments: [{
        filename: 'match_Logo_2023.png',
        path: path.join(__dirname, '../src/assets/match_Logo_2023.png'),
        cid: 'matchlogo'
      }]
    });
    console.log(`[EMAIL] Status-Update E-Mail an Werkstatt gesendet: ${info.messageId}`);
  } catch (error) {
    console.error('[EMAIL] Fehler beim Senden der Werkstatt-E-Mail:', error);
  }
}

/**
 * Sendet E-Mail an alle relevanten Personen, wenn ein Auftrag bearbeitet wurde.
 */
async function sendOrderEditedEmail(transporter, db, orderId, orderData, changedFields, editorName) {
  try {
    const targetEmails = await getWorkshopRecipients(db, orderData);

    // 1. Client (Auftraggeber) immer hinzufügen
    if (orderData.clientId) {
      try {
        const clientUser = await db.collection('User').findOne({ _id: new ObjectId(orderData.clientId) });
        if (clientUser && clientUser.email) targetEmails.add(clientUser.email);
      } catch(e) { /* ignore */ }
    }

    if (targetEmails.size === 0) {
      console.log(`[EMAIL] Keine Empfänger für bearbeiteten Auftrag ${orderId} gefunden.`);
      return;
    }

    const orderNumber = orderData.orderNumber || orderData._id || orderId;
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const orderLink = `${appUrl}/orders/${orderNumber}`;

    const fieldTranslations = {
      title: 'Titel',
      description: 'Beschreibung',
      deadline: 'Deadline (Frist)',
      costCenter: 'Kostenstelle',
      priority: 'Priorität',
      orderType: 'Auftragstyp',
      documents: 'Allgemeine Dokumente',
      assignedTo: 'Zugewiesener Mitarbeiter',
      notes: 'Anmerkungen',
      internalWorkshopNote: 'Interne Werkstattnotiz',
      estimatedHours: 'Geschätzte Stunden',
      actualHours: 'Tatsächliche Stunden',
      status: 'Status',
      materialOrderedByWorkshop: 'Material durch Werkstatt bestellt',
      materialOrderedByClient: 'Material durch Auftraggeber bestellt',
      materialOrderedByClientConfirmed: 'Materialbestellung (Kunde) bestätigt',
      materialAvailable: 'Material vorhanden',
      Bauteile: 'Bauteile'
    };

    const changesList = Object.keys(changedFields)
      .map(key => {
        const readableKey = fieldTranslations[key] || key;
        return `<li><strong>${readableKey}:</strong> Geändert</li>`;
      })
      .join('');

    const html = createBaseEmailHtml(
      `Auftrag ${orderNumber} wurde bearbeitet`,
      `
      <p>Hallo,</p>
      <p>der Auftrag <strong>"${orderData.title}"</strong> wurde soeben durch <strong>${editorName || 'einen Benutzer'}</strong> bearbeitet.</p>
      
      <h3>Geänderte Felder:</h3>
      <ul>
        ${changesList || '<li>Keine spezifischen Felder erkannt (oder allgemeine Aktualisierung)</li>'}
      </ul>

      ${renderButton(orderLink, 'Aktualisierten Auftrag öffnen')}
      `
    );

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: Array.from(targetEmails).join(','),
      subject: `[Werkstatt] Auftrag bearbeitet: ${orderNumber}`,
      html: html,
      attachments: [{
        filename: 'match_Logo_2023.png',
        path: path.join(__dirname, '../src/assets/match_Logo_2023.png'),
        cid: 'matchlogo'
      }]
    });
    console.log(`[EMAIL] Bearbeitungs-E-Mail gesendet: ${info.messageId}`);
  } catch (error) {
    console.error('[EMAIL] Fehler beim Senden der Bearbeitungs-E-Mail:', error);
  }
}

module.exports = {
  sendWaitingConfirmationEmail,
  sendWorkshopStatusUpdateEmail,
  sendOrderEditedEmail
};
