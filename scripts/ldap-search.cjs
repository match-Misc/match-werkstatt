const ldap = require('ldapjs');

class LDAPSearch {
  constructor(config) {
    this.config = {
      url: config.useTLS ? `ldaps://${config.host}:${config.port}` : `ldap://${config.host}:${config.port}`,
      baseDN: config.baseDN,
      userSearchBase: config.userSearchBase || config.baseDN,
      bindDN: config.bindDN,
      bindPassword: config.bindPassword,
      domain: config.domain
    };
  }

  async findUserEmail(username) {
    if (!username) return null;

    return new Promise((resolve, reject) => {
      const client = ldap.createClient({
        url: this.config.url
      });

      client.on('error', (err) => {
        console.error('[LDAP Search] Client Error:', err);
        resolve(null);
      });

      // Build bind candidates
      const candidates = [];
      const rawBindDN = this.config.bindDN;
      if (rawBindDN.includes('@') || rawBindDN.includes('\\') || rawBindDN.includes('=')) {
        candidates.push(rawBindDN);
      } else {
        if (this.config.domain) {
          candidates.push(`${this.config.domain}\\${rawBindDN}`);
        }
        const domainSuffix = this.config.baseDN.split(',').filter(p => p.trim().startsWith('dc=')).map(p => p.trim().substring(3)).join('.');
        if (domainSuffix) {
          candidates.push(`${rawBindDN}@${domainSuffix}`);
        }
        if (this.config.userSearchBase) {
          candidates.push(`CN=${rawBindDN},${this.config.userSearchBase}`);
        }
      }

      let bindSuccess = false;
      let lastBindError = null;

      const attemptBind = (dn) => {
        return new Promise((res) => {
          client.bind(dn, this.config.bindPassword, (err) => {
            if (err) {
              res({ success: false, err });
            } else {
              res({ success: true });
            }
          });
        });
      };

      (async () => {
        for (const dn of candidates) {
          const result = await attemptBind(dn);
          if (result.success) {
            bindSuccess = true;
            break;
          }
          lastBindError = result.err;
        }

        if (!bindSuccess) {
          console.error('[LDAP Search] Bind Error all candidates failed. Last error:', lastBindError?.message);
          client.unbind();
          return reject(new Error('LDAP Bind fehlgeschlagen: ' + (lastBindError?.message || 'Unknown')));
        }

        const searchOptions = {
          scope: 'sub',
          filter: `(|(uid=${username})(sAMAccountName=${username})(cn=${username}))`,
          attributes: ['mail', 'email'],
          paged: true,
          sizeLimit: 1
        };

        client.search(this.config.userSearchBase, searchOptions, (err, res) => {
          if (err) {
            console.error('[LDAP Search] Search Error:', err.message);
            client.unbind();
            return reject(new Error('LDAP Search fehlgeschlagen: ' + err.message));
          }

          let foundEmail = null;

          res.on('searchEntry', (entry) => {
            const mailObj = entry.attributes.find(a => a.type === 'mail' || a.type === 'email');
            if (mailObj && mailObj.vals && mailObj.vals.length > 0) {
              foundEmail = mailObj.vals[0];
            }
          });

          res.on('error', (err) => {
            console.error('[LDAP Search] Search Result Error:', err.message);
            client.unbind();
            if (foundEmail) {
              return resolve(foundEmail);
            }
            reject(new Error('LDAP Search Result Error: ' + err.message));
          });

          res.on('end', () => {
            client.unbind();
            resolve(foundEmail);
          });
        });
      })();
    });
  }

  async findUserEmailWithCredentials(searchUsername, bindUsername, bindPassword) {
    if (!searchUsername || !bindUsername || !bindPassword) return null;

    return new Promise((resolve, reject) => {
      const client = ldap.createClient({
        url: this.config.url
      });

      client.on('error', (err) => {
        console.error('[LDAP Search] Client Error:', err.message);
        resolve(null);
      });

      // Build candidates for the user's bind DN
      const candidates = [];
      if (bindUsername.includes('@') || bindUsername.includes('\\') || bindUsername.includes('=')) {
        candidates.push(bindUsername);
      } else {
        if (this.config.domain) {
          candidates.push(`${this.config.domain}\\${bindUsername}`);
        }
        const domainSuffix = this.config.baseDN.split(',').filter(p => p.trim().startsWith('dc=')).map(p => p.trim().substring(3)).join('.');
        if (domainSuffix) {
          candidates.push(`${bindUsername}@${domainSuffix}`);
        }
        if (this.config.userSearchBase) {
          candidates.push(`CN=${bindUsername},${this.config.userSearchBase}`);
        }
      }

      let bindSuccess = false;
      let lastBindError = null;

      const attemptBind = (dn) => {
        return new Promise((res) => {
          client.bind(dn, bindPassword, (err) => {
            if (err) {
              res({ success: false, err });
            } else {
              res({ success: true });
            }
          });
        });
      };

      (async () => {
        for (const dn of candidates) {
          const result = await attemptBind(dn);
          if (result.success) {
            bindSuccess = true;
            break;
          }
          lastBindError = result.err;
        }

        if (!bindSuccess) {
          console.error('[LDAP Search] User Bind Error:', lastBindError?.message);
          client.unbind();
          return resolve(null); // Don't throw, just return null if we can't find email
        }

        const searchOptions = {
          scope: 'sub',
          filter: `(|(uid=${searchUsername})(sAMAccountName=${searchUsername})(cn=${searchUsername}))`,
          attributes: ['mail', 'email'],
          paged: true,
          sizeLimit: 1
        };

        client.search(this.config.userSearchBase, searchOptions, (err, res) => {
          if (err) {
            console.error('[LDAP Search] Search Error:', err.message);
            client.unbind();
            return resolve(null);
          }

          let foundEmail = null;

          res.on('searchEntry', (entry) => {
            const mailObj = entry.attributes.find(a => a.type === 'mail' || a.type === 'email');
            if (mailObj && mailObj.vals && mailObj.vals.length > 0) {
              foundEmail = mailObj.vals[0];
            }
          });

          res.on('error', (err) => {
            client.unbind();
            if (foundEmail) {
              return resolve(foundEmail);
            }
            resolve(null);
          });

          res.on('end', () => {
            client.unbind();
            resolve(foundEmail);
          });
        });
      })();
    });
  }
}

module.exports = LDAPSearch;
