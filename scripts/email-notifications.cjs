const { ObjectId } = require('mongodb');

// Helfer-Funktion für Outlook-kompatibles HTML
const createBaseEmailHtml = (title, content) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
  .header { font-size: 20px; font-weight: bold; margin-bottom: 20px; color: #005A9C; }
  .table { width: 100%; border-collapse: collapse; margin-top: 15px; }
  .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  .table th { background-color: #f4f4f4; }
  .footer { margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 10px; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">${title}</div>
    ${content}
    <div class="footer">
      Dies ist eine automatisch generierte Nachricht aus der Match Werkstatt-App.<br>
      Bitte antworten Sie nicht direkt auf diese E-Mail.
    </div>
  </div>
</body>
</html>
`;

/**
 * Sendet E-Mail an den Kunden, wenn der Auftrag zur Abnahme freigegeben wurde.
 */
async function sendWaitingConfirmationEmail(transporter, db, orderId, orderData) {
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

    const html = createBaseEmailHtml(
      `Ihr Auftrag ${orderNumber} ist abholbereit`,
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
      `
    );

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: clientUser.email,
      subject: `Werkstatt-Auftrag ${orderNumber}: Zur Abnahme freigegeben`,
      html: html
    });
    console.log(`[EMAIL] Freigabe-E-Mail an Kunden gesendet: ${info.messageId}`);
  } catch (error) {
    console.error('[EMAIL] Fehler beim Senden der Kunden-E-Mail:', error);
  }
}

/**
 * Sendet E-Mail an Werkstatt, wenn der Kunde abnimmt oder Nacharbeit fordert.
 */
async function sendWorkshopStatusUpdateEmail(transporter, db, orderId, orderData, newStatus, commentData) {
  try {
    // Collect all emails to send to
    const targetEmails = new Set();

    // 1. Assigned employee
    if (orderData.assignedTo) {
      try {
        const assignedUser = await db.collection('User').findOne({ _id: new ObjectId(orderData.assignedTo) });
        if (assignedUser && assignedUser.email) {
          targetEmails.add(assignedUser.email);
        }
      } catch(e) { /* ignore invalid objectid */ }
    }

    // 2. Subtask assignees
    if (orderData.subTasks && Array.isArray(orderData.subTasks)) {
      for (const task of orderData.subTasks) {
        if (task.assignedTo) {
          try {
            const taskUser = await db.collection('User').findOne({ _id: new ObjectId(task.assignedTo) });
            if (taskUser && taskUser.email) {
              targetEmails.add(taskUser.email);
            }
          } catch(e) { /* ignore */ }
        }
      }
    }

    // 3. Fallback: Admins if no one is assigned
    if (targetEmails.size === 0) {
      const admins = await db.collection('User').find({ role: 'admin' }).toArray();
      for (const admin of admins) {
        if (admin.email) {
          targetEmails.add(admin.email);
        }
      }
    }

    if (targetEmails.size === 0) {
      console.log(`[EMAIL] Keine Empfänger (Werkstatt) für Auftrag ${orderId} gefunden.`);
      return;
    }

    const orderNumber = orderData.orderNumber || orderData._id || orderId;
    const isCompleted = newStatus === 'completed';
    const statusText = isCompleted ? 'abgeschlossen (Endabnahme)' : 'zur Nacharbeit zurückgewiesen';
    
    const clientName = commentData?.userName || orderData.clientName || 'Kunde';
    const comment = commentData?.comment || 'Kein Kommentar hinterlegt';

    const html = createBaseEmailHtml(
      `Auftrag ${orderNumber} wurde ${statusText}`,
      `
      <p>Hallo Werkstatt-Team,</p>
      <p>der Auftrag <strong>"${orderData.title}"</strong> wurde durch den Kunden (${clientName}) <strong>${statusText}</strong>.</p>
      
      <h3>Kommentar des Kunden:</h3>
      <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid ${isCompleted ? '#4CAF50' : '#FF9800'}; margin-bottom: 20px;">
        <em>"${comment}"</em>
      </div>

      <p>Bitte prüfen Sie den Vorgang in der Werkstatt-App.</p>
      `
    );

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: Array.from(targetEmails).join(','),
      subject: `[Werkstatt] Auftrag ${orderNumber}: ${isCompleted ? 'Abgenommen' : 'Nacharbeit'}`,
      html: html
    });
    console.log(`[EMAIL] Status-Update E-Mail an Werkstatt gesendet: ${info.messageId}`);
  } catch (error) {
    console.error('[EMAIL] Fehler beim Senden der Werkstatt-E-Mail:', error);
  }
}

module.exports = {
  sendWaitingConfirmationEmail,
  sendWorkshopStatusUpdateEmail
};
