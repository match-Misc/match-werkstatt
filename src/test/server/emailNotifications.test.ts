import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const emailNotifications = require('../../../scripts/email-notifications.cjs');

const clientId = '507f1f77bcf86cd799439011';
const assigneeId = '507f191e810c19729de860ea';

function createDb(users: Record<string, { email: string; name: string }>) {
  return {
    collection(name: string) {
      if (name === 'Component') {
        return { find: () => ({ toArray: async () => [] }) };
      }
      if (name !== 'User') throw new Error(`Unexpected collection: ${name}`);
      return {
        async findOne({ _id }: { _id: { toString(): string } }) {
          return users[_id.toString()] || null;
        },
        find() {
          return { toArray: async () => [] };
        }
      };
    }
  };
}

describe('sendClientAssignmentEmail', () => {
  it('notifies the responsible person without sending them the client assignment email', async () => {
    const sentMails: Array<Record<string, string>> = [];
    const transporter = {
      async sendMail(mail: Record<string, string>) {
        sentMails.push(mail);
        return { messageId: 'test-message' };
      }
    };
    const db = createDb({
      [assigneeId]: { name: 'Verantwortliche Person', email: 'assignee@example.test' },
      [clientId]: { name: 'Neue Auftraggeberin', email: 'client@example.test' }
    });

    await emailNotifications.sendOrderEditedEmail(
      transporter,
      db,
      'order-id',
      { assignedTo: assigneeId, clientId, orderNumber: 'F-0001-2608', title: 'Prüfauftrag' },
      { clientId },
      'Werkstattleitung',
      { includeClient: false }
    );

    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].to).toBe('assignee@example.test');
    expect(sentMails[0].subject).toContain('Auftrag bearbeitet');
  });

  it('notifies a newly assigned client with a dedicated assignment email', async () => {
    const sentMails: Array<Record<string, string>> = [];
    const transporter = {
      async sendMail(mail: Record<string, string>) {
        sentMails.push(mail);
        return { messageId: 'test-message' };
      }
    };
    const db = createDb({
      [clientId]: { name: 'Neue Auftraggeberin', email: 'client@example.test' }
    });

    await emailNotifications.sendClientAssignmentEmail(transporter, db, 'order-id', {
      clientId,
      orderNumber: 'F-0001-2608',
      title: 'Prüfauftrag'
    });

    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].to).toBe('client@example.test');
    expect(sentMails[0].subject).toContain('als Auftraggeber');
    expect(sentMails[0].html).toContain('Sie sind jetzt als Auftraggeber');
  });
});

describe('sendOrderStatusChangeEmails', () => {
  function createMailer() {
    const sentMails: Array<Record<string, string>> = [];
    const transporter = {
      async sendMail(mail: Record<string, string>) {
        sentMails.push(mail);
        return { messageId: 'test-message' };
      }
    };
    return { sentMails, transporter };
  }

  const db = createDb({
    [clientId]: { name: 'Auftraggeberin', email: 'client@example.test' },
    [assigneeId]: { name: 'Werkstatt', email: 'workshop@example.test' }
  });
  const order = {
    clientId,
    assignedTo: assigneeId,
    orderNumber: 'F-0001-2608',
    title: 'Prüfauftrag'
  };

  it('confirms a rework request to the client and informs the workshop', async () => {
    const { sentMails, transporter } = createMailer();

    await emailNotifications.sendOrderStatusChangeEmails(
      transporter, db, 'order-id', order, 'waiting_confirmation', 'rework',
      { userName: 'Auftraggeberin', revisionComment: 'Bitte korrigieren' }
    );

    expect(sentMails).toHaveLength(2);
    expect(sentMails.find(mail => mail.to === 'client@example.test')?.subject).toContain('Nacharbeit');
    expect(sentMails.find(mail => mail.to === 'workshop@example.test')?.subject).toContain('Nacharbeit');
  });

  it('does not email the client when the workshop starts rework', async () => {
    const { sentMails, transporter } = createMailer();

    await emailNotifications.sendOrderStatusChangeEmails(
      transporter, db, 'order-id', order, 'rework', 'in_progress'
    );

    expect(sentMails).toHaveLength(0);
  });

  it('sends the client a rework completion mail requiring final approval', async () => {
    const { sentMails, transporter } = createMailer();

    await emailNotifications.sendOrderStatusChangeEmails(
      transporter, db, 'order-id', { ...order, reworkComments: [{ comment: 'Nacharbeit' }] },
      'in_progress', 'waiting_confirmation'
    );

    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].to).toBe('client@example.test');
    expect(sentMails[0].subject).toContain('Nacharbeit abgeschlossen');
    expect(sentMails[0].html).toContain('Endabnahme');
  });

  it('keeps the revision request mail to the client', async () => {
    const { sentMails, transporter } = createMailer();

    await emailNotifications.sendOrderStatusChangeEmails(
      transporter, db, 'order-id', order, 'accepted', 'revision',
      { revisionComment: 'Bitte Zeichnung ändern' }
    );

    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].to).toBe('client@example.test');
    expect(sentMails[0].html).toContain('Bitte Zeichnung ändern');
    expect(sentMails[0].html).toContain('Auftrag jetzt überarbeiten');
  });

  it('keeps the ordinary final approval mail for orders without rework', async () => {
    const { sentMails, transporter } = createMailer();

    await emailNotifications.sendOrderStatusChangeEmails(
      transporter, db, 'order-id', order, 'in_progress', 'waiting_confirmation'
    );

    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].to).toBe('client@example.test');
    expect(sentMails[0].subject).toContain('Endabnahme');
    expect(sentMails[0].subject).not.toContain('Nacharbeit');
  });

  it('does not send another mail when the status is unchanged', async () => {
    const { sentMails, transporter } = createMailer();

    await emailNotifications.sendOrderStatusChangeEmails(
      transporter, db, 'order-id', order, 'rework', 'rework'
    );

    expect(sentMails).toHaveLength(0);
  });
});

describe('sendRevisionRequestEmail', () => {
  it('sends the current client a revision request with comment and edit link', async () => {
    const sentMails: Array<Record<string, string>> = [];
    const transporter = {
      async sendMail(mail: Record<string, string>) {
        sentMails.push(mail);
        return { messageId: 'test-message' };
      }
    };
    const db = createDb({
      [clientId]: { name: 'Auftraggeberin', email: 'client@example.test' }
    });

    await emailNotifications.sendRevisionRequestEmail(transporter, db, 'order-id', {
      clientId,
      orderNumber: 'F-0001-2608',
      title: 'Prüfauftrag'
    }, 'Bitte die Zeichnung <prüfen>');

    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].to).toBe('client@example.test');
    expect(sentMails[0].subject).toContain('Bitte Auftrag F-0001-2608 überarbeiten');
    expect(sentMails[0].html).toContain('Bitte die Zeichnung &lt;prüfen&gt;');
    expect(sentMails[0].html).toContain('/orders/F-0001-2608/edit');
    expect(sentMails[0].html).toContain('Auftrag jetzt überarbeiten');
  });

  it('does not send a revision request without a client email', async () => {
    const sentMails: Array<Record<string, string>> = [];
    const transporter = {
      async sendMail(mail: Record<string, string>) {
        sentMails.push(mail);
        return { messageId: 'test-message' };
      }
    };

    await emailNotifications.sendRevisionRequestEmail(transporter, createDb({}), 'order-id', {
      clientId,
      orderNumber: 'F-0001-2608'
    }, 'Bitte überarbeiten');

    expect(sentMails).toHaveLength(0);
  });
});
