
const LDAPSearch = require('./scripts/ldap-search.cjs');

const ldapConfig = {
  host: process.env.LDAP_HOST,
  port: parseInt(process.env.LDAP_PORT) || 389,
  useTLS: process.env.LDAP_USE_TLS === 'true',
  baseDN: process.env.LDAP_BASE_DN,
  userSearchBase: process.env.LDAP_USER_SEARCH_BASE,
  bindDN: process.env.LDAP_BIND_DN,
  bindPassword: process.env.LDAP_BIND_PASSWORD,
  domain: process.env.LDAP_DOMAIN
};

// Add domain to bindDN if it's an AD server and bindDN doesn't have it
let bindDN = ldapConfig.bindDN;
if (ldapConfig.domain && !bindDN.includes('@') && !bindDN.includes('\\') && !bindDN.includes('=')) {
  bindDN = `${ldapConfig.domain}\\${bindDN}`;
}
ldapConfig.bindDN = bindDN;

console.log('Using config:', ldapConfig);

const search = new LDAPSearch(ldapConfig);
search.findUserEmail('Lurz').then(email => {
  console.log('Result:', email);
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
