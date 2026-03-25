const net = require('net');
const tls = require('tls');

/**
 * Einfache LDAP-Authentifizierung ohne externe Abhängigkeiten
 * Verwendet natives Node.js für LDAP Simple Bind
 */
class SimpleLDAPAuth {
  constructor(config) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 389,
      useTLS: config.useTLS || false,
      baseDN: config.baseDN || '',
      userSearchBase: config.userSearchBase || '',
      userSearchFilter: config.userSearchFilter || '(uid={{username}})',
      domain: config.domain || '',
      userDnTemplates: Array.isArray(config.userDnTemplates) ? config.userDnTemplates : [],
      bindDN: config.bindDN || '',
      bindPassword: config.bindPassword || ''
    };
  }

  /**
   * LDAP Simple Bind Authentication
   * @param {string} username 
   * @param {string} password 
   * @returns {Promise<Object|null>} User-Daten oder null
   */
  async authenticate(username, password) {
    if (!username || !password) {
      return null;
    }

    const candidates = this.buildCandidateUserDNs(username);
    if (candidates.length === 0) {
      return null;
    }

    for (const userDN of candidates) {
      try {
        console.log(`[LDAP] Versuche Authentifizierung: ${userDN}`);
        const isSuccess = await this.attemptBind(userDN, password);
        if (isSuccess) {
          console.log('[LDAP] Authentifizierung erfolgreich');
          return this.extractUserInfo(username, userDN);
        }
      } catch (error) {
        console.error(`[LDAP] Bind-Fehler für ${userDN}:`, error.message);
      }
    }

    return null;
  }

  /**
   * Führt einen LDAP Simple Bind-Versuch aus
   * @param {string} userDN
   * @param {string} password
   * @returns {Promise<boolean>}
   */
  async attemptBind(userDN, password) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const complete = (result, err = null) => {
        if (finished) {
          return;
        }
        finished = true;
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      };

      const socket = this.config.useTLS
        ? tls.connect(this.config.port, this.config.host)
        : net.connect(this.config.port, this.config.host);

      socket.on('connect', () => {
        const bindRequest = this.createBindRequest(userDN, password);
        socket.write(bindRequest);
      });

      socket.on('data', (data) => {
        const isSuccess = this.isBindSuccessful(data);
        socket.end();
        complete(isSuccess);
      });

      socket.on('error', (err) => {
        socket.destroy();
        complete(false, err);
      });

      socket.on('timeout', () => {
        socket.destroy();
        complete(false);
      });

      socket.setTimeout(10000);
    });
  }

  /**
   * Konstruiert mehrere User-DN-Kandidaten aus Username
   * @param {string} username 
   * @returns {string[]} User DNs
   */
  buildCandidateUserDNs(username) {
    const candidates = [];
    const pushUnique = (value) => {
      if (!value || typeof value !== 'string') {
        return;
      }
      const trimmed = value.trim();
      if (trimmed && !candidates.includes(trimmed)) {
        candidates.push(trimmed);
      }
    };

    // UPN/DOMAIN\\user direkt übernehmen, falls bereits vollständig.
    if (username.includes('@') || username.includes('\\')) {
      pushUnique(username);
    }

    if (this.config.domain) {
      pushUnique(`${this.config.domain}\\${username}`);
      pushUnique(`${username}@${this.config.domain}`);
    }

    for (const template of this.config.userDnTemplates) {
      pushUnique(template.replace(/\{\{\s*username\s*\}\}/g, username));
    }

    if (this.config.userSearchBase) {
      if (this.config.userSearchBase.includes('cn=Users')) {
        pushUnique(`cn=${username},${this.config.userSearchBase}`);
      }
      pushUnique(`uid=${username},${this.config.userSearchBase}`);
      pushUnique(`cn=${username},${this.config.userSearchBase}`);
    }

    return candidates;
  }

  /**
   * Erstellt LDAP Bind Request
   * @param {string} dn 
   * @param {string} password 
   * @returns {Buffer} LDAP Bind Request
   */
  createBindRequest(dn, password) {
    const dnBuffer = Buffer.from(dn, 'utf8');
    const passwordBuffer = Buffer.from(password, 'utf8');

    const messageId = Buffer.from([0x02, 0x01, 0x01]);
    const version = Buffer.from([0x02, 0x01, 0x03]);
    const name = Buffer.concat([
      Buffer.from([0x04]),
      this.encodeLength(dnBuffer.length),
      dnBuffer
    ]);
    const authentication = Buffer.concat([
      Buffer.from([0x80]),
      this.encodeLength(passwordBuffer.length),
      passwordBuffer
    ]);

    const bindRequestBody = Buffer.concat([version, name, authentication]);
    const bindRequest = Buffer.concat([
      Buffer.from([0x60]),
      this.encodeLength(bindRequestBody.length),
      bindRequestBody
    ]);

    const ldapMessageBody = Buffer.concat([messageId, bindRequest]);
    return Buffer.concat([
      Buffer.from([0x30]),
      this.encodeLength(ldapMessageBody.length),
      ldapMessageBody
    ]);
  }

  /**
   * Kodiert ASN.1 BER-Längen (short/long form)
   * @param {number} length
   * @returns {Buffer}
   */
  encodeLength(length) {
    if (length < 128) {
      return Buffer.from([length]);
    }

    const bytes = [];
    let value = length;
    while (value > 0) {
      bytes.unshift(value & 0xff);
      value = value >> 8;
    }

    return Buffer.from([0x80 | bytes.length, ...bytes]);
  }

  /**
   * Prüft ob Bind erfolgreich war
   * @param {Buffer} response 
   * @returns {boolean}
   */
  isBindSuccessful(response) {
    // Vereinfachte Response-Parsing
    // LDAP Result Code 0 = Success
    return response.includes(Buffer.from([0x0a, 0x01, 0x00]));
  }

  /**
   * Extrahiert Benutzer-Informationen
   * @param {string} username 
   * @param {string} dn 
   * @returns {Object}
   */
  extractUserInfo(username, dn) {
    // Basis-Benutzerinformationen
    return {
      username: username,
      dn: dn,
      email: this.guessEmail(username),
      displayName: this.guessDisplayName(username),
      name: this.guessDisplayName(username),
      authSource: 'ldap'
    };
  }

  /**
   * Versucht E-Mail zu erraten
   * @param {string} username 
   * @returns {string}
   */
  guessEmail(username) {
    // Einfache E-Mail-Konstruktion
    const domain = this.config.baseDN
      .split(',')
      .filter(part => part.trim().startsWith('dc='))
      .map(part => part.trim().substring(3))
      .join('.');
    
    return `${username}@${domain}`;
  }

  /**
   * Versucht Display Name zu erraten
   * @param {string} username 
   * @returns {string}
   */
  guessDisplayName(username) {
    // Einfache Name-Konstruktion aus Username
    return username.split('.').map(part => 
      part.charAt(0).toUpperCase() + part.slice(1)
    ).join(' ');
  }

  /**
   * Testet LDAP-Verbindung
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    return new Promise((resolve) => {
      const socket = this.config.useTLS ? 
        tls.connect(this.config.port, this.config.host) :
        net.connect(this.config.port, this.config.host);

      socket.on('connect', () => {
        console.log('[LDAP] Test-Verbindung erfolgreich');
        socket.end();
        resolve(true);
      });

      socket.on('error', (err) => {
        console.error('[LDAP] Test-Verbindung fehlgeschlagen:', err.message);
        resolve(false);
      });

      socket.setTimeout(5000);
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }
}

module.exports = SimpleLDAPAuth;
