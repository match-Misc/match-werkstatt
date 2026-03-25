# LDAP Setup

Diese Anwendung unterstuetzt Hybrid-Login:
- LDAP-Authentifizierung wird zuerst versucht.
- Bei Fehlschlag erfolgt Fallback auf lokalen Login (MongoDB User/Passwort).

## Zielverhalten

- LDAP und lokaler Login laufen parallel.
- Bei erstem erfolgreichem LDAP-Login wird automatisch ein lokaler User angelegt.
- Neue LDAP-User erhalten standardmaessig Rolle `client`.
- Rollen koennen danach durch Admins geaendert werden (`client`, `workshop`, `admin`).

## Wichtige Umgebungsvariablen

```env
LDAP_HOST=ldap.company.local
LDAP_PORT=389
LDAP_USE_TLS=false

LDAP_BASE_DN=dc=company,dc=local
LDAP_USER_SEARCH_BASE=ou=users,dc=company,dc=local

# Fuer Username-Login (ohne @domain) hilfreich:
LDAP_DOMAIN=company.local

# Optional: mehrere DN-Pattern in Reihenfolge testen
# Platzhalter: {{username}}
LDAP_USER_DN_TEMPLATES=cn={{username}},OU=Users,DC=company,DC=local;uid={{username}},OU=Users,DC=company,DC=local
```

Hinweis zu `LDAP_USER_DN_TEMPLATES`:
- Werte werden mit `;` (Semikolon) oder Zeilenumbruch getrennt.
- Jeder Eintrag wird mit `{{username}}` ersetzt.
- Falls leer, werden Standard-Kandidaten erzeugt (`uid=...` und `cn=...` auf Basis von `LDAP_USER_SEARCH_BASE`).

## Windows Server 2019 / Active Directory Empfehlung

Fuer AD mit Username-Login (`max.mustermann`) sind diese Werte ein guter Start:

```env
LDAP_HOST=<dc-hostname-oder-ip>
LDAP_PORT=389
LDAP_USE_TLS=false
LDAP_BASE_DN=DC=test,DC=uni-hannover,DC=de
LDAP_USER_SEARCH_BASE=OU=Users,DC=test,DC=uni-hannover,DC=de
LDAP_DOMAIN=test.uni-hannover.de
LDAP_USER_DN_TEMPLATES=CN={{username}},OU=Users,DC=test,DC=uni-hannover,DC=de
```

Optional (falls `CN={{username}}` nicht passt):
- `LDAP_USER_DN_TEMPLATES=CN={{username}},OU=Users,DC=test,DC=uni-hannover,DC=de;UID={{username}},OU=Users,DC=test,DC=uni-hannover,DC=de`
- Oder UPN-Login direkt im Frontend verwenden (`max.mustermann@test.uni-hannover.de`).

## Login-Formate

Fuer eure Umgebung (Username-Login) ist die typische Eingabe:
- `max.mustermann`

Intern werden mehrere Bind-Varianten probiert, u.a.:
- `company.local\max.mustermann` (wenn `LDAP_DOMAIN` gesetzt ist)
- `max.mustermann@company.local` (wenn `LDAP_DOMAIN` gesetzt ist)
- DN-Templates aus `LDAP_USER_DN_TEMPLATES`
- Standard-DNs auf Basis von `LDAP_USER_SEARCH_BASE`

## LDAP Admin APIs

- `GET /api/ldap/test`: Testet LDAP-Erreichbarkeit.
- `POST /api/ldap/test-auth`: Testet LDAP-Bind mit Username/Passwort.
- `GET /api/ldap/users`: Liefert lokal bekannte LDAP-User.
- `POST /api/ldap/sync`: Markiert bekannte LDAP-User als synchronisiert.
- `PUT /api/ldap/users/:username/role`: Setzt Rolle fuer LDAP-User.

## Troubleshooting

- LDAP erreichbar, aber Login faellt auf lokal zurueck:
	- `LDAP_USER_SEARCH_BASE` und DN-Templates pruefen.
	- `LDAP_DOMAIN` setzen, wenn nur Username eingegeben wird.
- Rolle erscheint als `kunde`/`werkstatt`:
	- Alte Rollenwerte werden auf `client`/`workshop` normalisiert.
- LDAP-Login klappt, aber User fehlt lokal:
	- Beim ersten LDAP-Login wird automatisch ein lokaler Eintrag erstellt.
