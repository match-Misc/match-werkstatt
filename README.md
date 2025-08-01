# Match-Werkstatt 🔧
## Modernes Werkstatt-Verwaltungssystem mit Hybrid-LDAP-Authentifizierung

Match-Werkstatt ist ein umfassendes System zur Verwaltung von Werkstattaufträgen mit moderner Web-Technologie und flexibler Benutzerauthentifizierung.

## ✨ Features

### 🔐 Hybrid-Authentifizierung
- **LDAP-Integration**: Zentrale Benutzerverwaltung über LDAP-Server
- **Lokale Fallback-Authentifizierung**: Funktioniert auch ohne LDAP
- **Rollenverwaltung**: Lokale Rollen-/Berechtigungsverwaltung in MongoDB
- **Nahtloser Übergang**: Automatischer Fallback bei LDAP-Ausfall

### 👥 Benutzerverwaltung
- **Admin-Bereich**: Vollständige System- und Benutzerverwaltung
- **Werkstatt-Accounts**: Mitarbeiter-Verwaltung für Werkstattpersonal
- **Kunden-Accounts**: Registrierung und Verwaltung von Auftraggebern
- **LDAP-Synchronisation**: Automatische Benutzer-Synchronisation
- **Rollenbasierte Berechtigungen**: Admin, Werkstatt, Kunde

### 📋 Auftragsverwaltung
- **Digitale Auftragserfassung**: Vollständige Auftragsdaten
- **QR-Code-System**: Schnelle Auftragserkennung
- **Status-Tracking**: Live-Verfolgung des Bearbeitungsstatus
- **Datei-Uploads**: Anhänge und Dokumente pro Auftrag
- **Zeitstempel**: Automatische Erfassung aller Änderungen

### 📱 Moderne Benutzeroberfläche
- **Responsive Design**: Optimiert für Desktop, Tablet und Mobile
- **Echtzeit-Updates**: WebSocket-basierte Live-Aktualisierungen
- **Intuitive Navigation**: Benutzerfreundliche Oberfläche
- **Dark/Light Mode**: Anpassbare Darstellung

## 🔧 Installation & Setup

### Voraussetzungen
- Node.js (v16 oder höher)
- npm oder yarn
- MongoDB (lokal oder remote)
- Optional: LDAP-Server für zentrale Benutzerverwaltung

### 1. Repository klonen
```bash
git clone <repository-url>
cd match-werkstatt
```

### 2. Abhängigkeiten installieren
```bash
npm install
```

### 3. Konfigurationsdateien erstellen
```bash
# Standard-Konfiguration
cp .env.example .env

# LDAP-Konfiguration (optional)
cp .env.ldap.example .env.ldap
```

### 4. Umgebungsvariablen konfigurieren

#### Standard-Konfiguration (.env)
```env
MONGODB_URI=mongodb://localhost:27017/match-werkstatt
PORT=3001
JWT_SECRET=your-super-secret-jwt-key
NODE_ENV=development
```

#### LDAP-Konfiguration (.env.ldap) - Optional
```env
LDAP_HOST=ldap.example.com
LDAP_PORT=389
LDAP_BASE_DN=dc=example,dc=com
LDAP_BIND_DN=cn=admin,dc=example,dc=com
LDAP_BIND_PASSWORD=your-ldap-password
LDAP_ENABLED=true
LDAP_USER_FILTER=(uid=%username%)
LDAP_USERNAME_ATTRIBUTE=uid
LDAP_EMAIL_ATTRIBUTE=mail
LDAP_DISPLAY_NAME_ATTRIBUTE=displayName
LDAP_ALLOW_LOCAL_FALLBACK=true
```

### 5. Datenbank starten
```bash
# MongoDB starten (falls lokal installiert)
mongod

# Oder Docker verwenden
docker run -d -p 27017:27017 --name match-mongo mongo:latest
```

### 6. Anwendung starten

#### Entwicklungsmodus
```bash
# Backend starten (Port 3001)
node server.cjs

# Frontend starten (Port 5178)
npm run dev
```

#### Produktionsmodus
```bash
# Frontend bauen
npm run build

# Backend starten
NODE_ENV=production node server.cjs
```

### 7. Standard-Admin anlegen
Nach dem ersten Start können Sie über die Web-Oberfläche einen Admin-Account registrieren oder direkt in der Datenbank anlegen.

## 🏗️ Systemarchitektur

### Backend (Node.js/Express)
- **REST API**: Vollständige API für alle Funktionen
- **MongoDB Integration**: Moderne NoSQL-Datenbank
- **JWT-Authentifizierung**: Sichere Token-basierte Auth
- **WebSocket-Support**: Echtzeit-Kommunikation
- **LDAP-Integration**: Custom LDAP-Client ohne externe Dependencies

### Frontend (React/Vite)
- **React 18**: Moderne React-Features
- **TypeScript**: Typisierte Entwicklung
- **Tailwind CSS**: Utility-first CSS-Framework
- **Vite**: Schneller Build-Prozess
- **Responsive Design**: Mobile-first Ansatz

### Hybrid-Authentifizierung
```
Login-Versuch
    ↓
LDAP verfügbar?
    ↓ Ja          ↓ Nein
LDAP-Auth    →  Lokale Auth
    ↓
Erfolgreich?
    ↓ Ja          ↓ Nein
Rolle aus     →  Lokale Auth
MongoDB           (Fallback)
    ↓
Login-Erfolg
```

## 👥 Benutzerrollen

### 🛡️ Admin
- **Vollzugriff**: Alle Systemfunktionen
- **Benutzerverwaltung**: Accounts erstellen/bearbeiten/löschen
- **LDAP-Verwaltung**: LDAP-Konfiguration und Synchronisation
- **Systemkonfiguration**: Netzwerk- und Server-Einstellungen
- **Auftragsverwaltung**: Alle Aufträge verwalten

### 🔧 Werkstatt
- **Auftragsbearbeitung**: Status-Updates und Bearbeitung
- **Kunden-Interaktion**: Kommunikation mit Auftraggebern
- **Datei-Management**: Upload und Verwaltung von Dokumenten
- **QR-Code-Scanning**: Schnelle Auftragserkennung

### 👤 Kunde
- **Aufträge erstellen**: Neue Reparaturaufträge anlegen
- **Status verfolgen**: Live-Tracking des Auftragsstatus
- **Kommunikation**: Nachrichten mit der Werkstatt
- **Historien-Einsicht**: Vergangene Aufträge einsehen

## 🔄 Workflow

### 1. Auftrag erstellen
1. **Kunde registriert sich** oder meldet sich an
2. **"Neuen Auftrag erstellen"** auswählen
3. **Auftragsdaten eingeben**: Gerät, Problem, Kontaktdaten
4. **Dateien hochladen**: Bilder, Dokumente (optional)
5. **Auftrag absenden**: Automatische QR-Code-Generierung

### 2. Auftrag bearbeiten
1. **Werkstatt scannt QR-Code** oder sucht Auftrag
2. **Status aktualisieren**: "In Bearbeitung", "Wartet auf Teile", etc.
3. **Notizen hinzufügen**: Arbeitsschritte dokumentieren
4. **Kunde wird informiert**: Automatische Benachrichtigungen

### 3. Auftrag abschließen
1. **Reparatur abschließen**: Status auf "Abgeschlossen" setzen
2. **Endabnahme**: Kunde bestätigt Reparatur
3. **Archivierung**: Auftrag wird archiviert
4. **Feedback**: Optional Bewertung durch Kunde

## 🔗 API-Endpunkte

### Authentifizierung
- `POST /api/login` - Hybrid-Login (LDAP + Lokal)
- `POST /api/register` - Benutzer registrieren
- `POST /api/logout` - Abmelden

### LDAP-Verwaltung (Admin)
- `GET /api/ldap/test` - LDAP-Verbindung testen
- `POST /api/ldap/test-auth` - LDAP-Authentifizierung testen
- `GET /api/ldap/users` - LDAP-Benutzer auflisten
- `POST /api/ldap/sync` - Benutzer synchronisieren
- `PUT /api/ldap/users/:username/role` - Rolle zuweisen

### Benutzerverwaltung
- `GET /api/users` - Alle Benutzer (Admin)
- `POST /api/users` - Benutzer erstellen (Admin)
- `PUT /api/users/:id` - Benutzer bearbeiten
- `DELETE /api/users/:id` - Benutzer löschen (Admin)

### Auftragsverwaltung
- `GET /api/orders` - Aufträge auflisten
- `POST /api/orders` - Neuen Auftrag erstellen
- `GET /api/orders/:id` - Auftrag Details
- `PUT /api/orders/:id` - Auftrag bearbeiten
- `DELETE /api/orders/:id` - Auftrag löschen
- `POST /api/orders/:id/files` - Datei hochladen

## 🚀 Deployment

### Docker-Deployment
```bash
# Dockerfile erstellen
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["node", "server.cjs"]

# Container bauen und starten
docker build -t match-werkstatt .
docker run -d -p 3001:3001 --name match-app match-werkstatt
```

### Produktionsserver
```bash
# PM2 für Prozess-Management
npm install -g pm2

# Anwendung starten
pm2 start server.cjs --name "match-werkstatt"

# Auto-Start nach Reboot
pm2 startup
pm2 save
```

## 🔒 Sicherheit

### Authentifizierung
- **JWT-Tokens**: Sichere, stateless Authentifizierung
- **Password-Hashing**: bcrypt für lokale Passwörter
- **LDAP-Sicherheit**: Sichere LDAP-Verbindungen
- **Session-Management**: Automatische Token-Erneuerung

### Autorisierung
- **Rollenbasiert**: Strenge Rollentrennung
- **API-Schutz**: Middleware für alle geschützten Routen
- **Input-Validierung**: Umfassende Eingabeprüfung
- **File-Upload-Sicherheit**: Validierung und Größenbegrenzung

## 🧪 Testing

### Frontend-Tests
```bash
npm run test
```

### Backend-Tests
```bash
npm run test:backend
```

### E2E-Tests
```bash
npm run test:e2e
```

## 📝 Entwicklung

### Code-Stil
- **ESLint**: Automatische Code-Analyse
- **Prettier**: Code-Formatierung
- **TypeScript**: Strenge Typisierung
- **Conventional Commits**: Standardisierte Commit-Messages

### Git-Workflow
```bash
# Feature-Branch erstellen
git checkout -b feature/neue-funktion

# Änderungen committen
git add .
git commit -m "feat: neue LDAP-Synchronisation"

# Push und Pull Request
git push origin feature/neue-funktion
```

## 🤝 Contributing

1. **Fork** das Repository
2. **Feature Branch** erstellen (`git checkout -b feature/AmazingFeature`)
3. **Commit** deine Änderungen (`git commit -m 'Add some AmazingFeature'`)
4. **Push** zum Branch (`git push origin feature/AmazingFeature`)
5. **Pull Request** öffnen

## 📄 Lizenz

Dieses Projekt steht unter der MIT Lizenz - siehe [LICENSE](LICENSE) Datei für Details.

## 📞 Support

Bei Fragen oder Problemen:
- **Issues**: GitHub Issues für Bug-Reports
- **Wiki**: Dokumentation im GitHub Wiki
- **Discussions**: Community-Diskussionen

---

**Match-Werkstatt** - Moderne Werkstattverwaltung mit Hybrid-LDAP-Authentifizierung 🚀
