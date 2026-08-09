import { describe, it, expect, vi } from 'vitest';

// Wir mocken fs, path etc. wenn wir die echten Funktionen testen
// Da die Backend-Logik in server.cjs ist (CommonJS), testen wir am besten
// die Funktion indem wir sie simulieren oder ausgliedern.
// Da getOrCreateOrderFolderName in server.cjs ist und nicht exportiert wird,
// testen wir stattdessen die reine Logik des Namensformats.

const formatOrderFolderName = (orderNumber, projectName, title) => {
  const sanitize = (str) => {
    if (!str) return '';
    return str.toString()
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\\s+/g, ' ')
      .trim();
  };

  const safeNumber = sanitize(orderNumber);
  const safeProject = sanitize(projectName);
  const safeTitle = sanitize(title);

  if (safeProject) {
    return \`\${safeNumber} - \${safeProject} - \${safeTitle}\`;
  } else {
    return \`\${safeNumber} - \${safeTitle}\`;
  }
};

describe('Order Folder Naming Logic', () => {
  it('should include projectName if provided', () => {
    const name = formatOrderFolderName('F-001', 'Test Projekt', 'Test Auftrag');
    expect(name).toBe('F-001 - Test Projekt - Test Auftrag');
  });

  it('should fallback to old format if projectName is missing', () => {
    const name = formatOrderFolderName('F-002', '', 'Test Auftrag 2');
    expect(name).toBe('F-002 - Test Auftrag 2');
  });

  it('should sanitize invalid characters', () => {
    const name = formatOrderFolderName('F/003', 'Projekt ?*', 'Auftrag:1');
    expect(name).toBe('F-003 - Projekt -- - Auftrag-1');
  });
});
