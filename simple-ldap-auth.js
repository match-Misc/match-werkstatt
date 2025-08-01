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
    return new Promise((resolve, reject) => {
      try {
        // Einfache DN-Konstruktion für Direct Bind
        const userDN = this.constructUserDN(username);
        
        console.log(`[LDAP] Versuche Authentifizierung: ${userDN}`);
        
        // Socket-Verbindung erstellen
        const socket = this.config.useTLS ? 
          tls.connect(this.config.port, this.config.host) :
          net.connect(this.config.port, this.config.host);

        socket.on('connect', () => {
          console.log('[LDAP] Verbindung hergestellt');
          
          // LDAP Bind Request erstellen
          const bindRequest = this.createBindRequest(userDN, password);
          socket.write(bindRequest);
        });

        socket.on('data', (data) => {
          console.log('[LDAP] Response erhalten');
          
          // Einfache Response-Parsing
          if (this.isBindSuccessful(data)) {
            console.log('[LDAP] Authentifizierung erfolgreich');
            socket.end();
            
            // Benutzer-Informationen aus DN extrahieren
            const userInfo = this.extractUserInfo(username, userDN);
            resolve(userInfo);
          } else {
            console.log('[LDAP] Authentifizierung fehlgeschlagen');
            socket.end();
            resolve(null);
          }
        });

        socket.on('error', (err) => {
          console.error('[LDAP] Socket-Fehler:', err.message);
          reject(err);
        });

        socket.on('timeout', () => {
          console.error('[LDAP] Verbindung-Timeout');
          socket.destroy();
          resolve(null);
        });

        socket.setTimeout(10000); // 10 Sekunden Timeout

      } catch (error) {
        console.error('[LDAP] Allgemeiner Fehler:', error.message);
        reject(error);
      }
    });
  }

  /**
   * Konstruiert User DN aus Username
   * @param {string} username 
   * @returns {string} User DN
   */
  constructUserDN(username) {
    // Verschiedene DN-Patterns unterstützen
    if (this.config.userSearchBase.includes('cn=Users')) {
      // Active Directory Pattern
      return `cn=${username},${this.config.userSearchBase}`;
    } else {
      // Standard LDAP Pattern
      return `uid=${username},${this.config.userSearchBase}`;
    }
  }

  /**
   * Erstellt LDAP Bind Request
   * @param {string} dn 
   * @param {string} password 
   * @returns {Buffer} LDAP Bind Request
   */
  createBindRequest(dn, password) {
    // Vereinfachte LDAP Bind Request (ASN.1 BER encoding)
    const dnBuffer = Buffer.from(dn, 'utf8');
    const passwordBuffer = Buffer.from(password, 'utf8');
    
    // LDAP Bind Request Structure (vereinfacht)
    const request = Buffer.concat([
      Buffer.from([0x30]), // SEQUENCE
      Buffer.from([dnBuffer.length + passwordBuffer.length + 10]), // Length
      Buffer.from([0x02, 0x01, 0x01]), // messageID: 1
      Buffer.from([0x60]), // Bind Request
      Buffer.from([dnBuffer.length + passwordBuffer.length + 6]), // Length
      Buffer.from([0x02, 0x01, 0x03]), // LDAP Version 3
      Buffer.from([0x04, dnBuffer.length]), // DN
      dnBuffer,
      Buffer.from([0x80, passwordBuffer.length]), // Simple Authentication
      passwordBuffer
    ]);
    
    return request;
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
