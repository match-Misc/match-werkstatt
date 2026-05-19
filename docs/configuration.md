# ⚙️ Konfiguration

## Environment Variables (.env)

Kopiere die `.env.example` Datei zu `.env` im Hauptverzeichnis des Projekts und passe die Werte an.

```env
# === MONGODB ===
# Root-Credentials (werden für das Init-Skript benötigt)
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=change-this-root-password

# App-Credentials (womit die Node.js App auf die DB zugreift)
MONGO_APP_USER=match-werkstatt
MONGO_APP_PASSWORD=change-this-app-password
MONGO_DB_NAME=matchdb

# === BACKUP ===
# Automatisches Backup via Sidecar-Container
BACKUP_DIR=./backups
BACKUP_TIME=03:00
BACKUP_RETAIN_COUNT=7
TZ=Europe/Berlin

# === LDAP (Optional) ===
# Ohne LDAP-Konfiguration nutzt das System reine MongoDB-Authentifizierung
LDAP_HOST=ldap.company.local
LDAP_PORT=389
LDAP_BASE_DN=dc=company,dc=local
LDAP_USER_SEARCH_BASE=ou=users,dc=company,dc=local
LDAP_DOMAIN=company.local
# LDAP_USER_DN_TEMPLATES=cn={{username}},OU=Users,DC=company,DC=local
# LDAP_BIND_DN=
# LDAP_BIND_PASSWORD=
```

### Hinweise
- Bei Nutzung von Docker + Nginx läuft das Frontend und die API unter derselben Origin (Port 80/5007). Es treten keine Browser-CORS-Probleme auf.
- Weitere detaillierte Informationen zur LDAP-Konfiguration findest du unter [LDAP Setup](ldap-setup.md).

---

## MongoDB-Konfiguration

Die Datenbank (Standardname `matchdb`) enthält folgende Collections:

| Collection | Beschreibung | Schema |
|------------|--------------|--------|
| `Order` | Alle Aufträge (Status, Priorität, Fristen, Endabnahme) | MongoDB Native |
| `Component` | Einzelne Bauteile zu einem Auftrag | MongoDB Native |
| `Document` | Dateien (Migration-Status, CAM, Netzwerkintegration) | MongoDB Native |
| `User` | Benutzer (Rolle, LDAP-Status, Credentials) | MongoDB Native |
| `NoteHistory` | Historische Notizen zu Aufträgen (mit Zeitstempel) | MongoDB Native |

Die Erstellung der Indizes und Collections erfolgt automatisch beim Start des Backend-Servers.
