import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const emailNotifications = require('../../../scripts/email-notifications.cjs');

const clientId = '507f1f77bcf86cd799439011';
const assigneeId = '507f191e810c19729de860ea';

function createDb(users: Record<string, { email: string; name: string }>) {
  return {
    collection(name: string) {
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
