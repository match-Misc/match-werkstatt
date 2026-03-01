# Match-Werkstatt 🔧
## Modernes Werkstatt-Verwaltungssystem mit MongoDB und Hybrid-LDAP

Ein umfassendes Auftragsmanagement-System für Werkstätten mit moderner Web-Technologie, Bauteilverwaltung, Netzwerk-Dateiintegration und flexibler Authentifizierung.

## ✨ Hauptfunktionen

### 🔐 Hybrid-Authentifizierung
- **LDAP-Integration**: Zentrale Benutzerverwaltung über LDAP-Server (optional)
- **MongoDB-Fallback**: Funktioniert vollständig ohne LDAP
- **Rollenverwaltung**: Admin, Werkstatt, Kunde
- **Nahtloser Übergang**: Automatischer Fallback bei LDAP-Ausfall

### 📋 Auftragsverwaltung
- **Bauteilverwaltung**: Mehrere Bauteile pro Auftrag mit separaten Dokumenten
- **Überarbeitungssystem**: Revision-Workflow mit Kommentaren und Historie
- **QR-Code-System**: Schnelle Auftragserkennung und -verwaltung
- **Status-Tracking**: Pending, Accepted, In Progress, Revision, Completed, Archived
- **Material-Status**: Werkstatt-/Kundenbestellungen mit Bestätigungen
- **Endabnahme**: Kundenbestätigung bei Auftragsabschluss

### 📁 Datei- & Netzwerkverwaltung
- **Netzwerk-Ordner-Integration**: Automatische Dateimigration zu Windows-Netzwerkfreigaben
- **CAM-Dateien**: Separate Verwaltung von Fertigungsdateien
- **3D-Viewer**: Integrierter STL/STEP-Datei-Viewer
- **Bauteil-Dokumente**: Individuelle Dateien pro Bauteil
- **Drag & Drop**: Komfortabler Datei-Upload

### 🔧 Werkstatt-Features
- **Auftragsnummern**: Automatische Generierung (F-YYMM-X Format)
- **Zeiterfassung**: Geschätzte vs. tatsächliche Arbeitsstunden
- **Teilaufgaben**: Aufgaben mit Zuweisung zu Bauteilen oder Gesamtauftrag
- **Notizen-Historie**: Vollständige Dokumentation aller Änderungen
- **Mitarbeiterverwaltung**: Zuweisungen und Verantwortlichkeiten

## �️ Technologie-Stack

### Backend
- **Node.js & Express**: REST API Server
- **MongoDB 8.0+**: NoSQL-Datenbank (ohne Prisma)
- **Native MongoDB Driver**: Direkte Datenbankoperationen
- **WebSocket**: Echtzeit-Updates
- **Multer**: Datei-Upload-Handling
- **bcryptjs**: Passwort-Hashing

### Frontend
- **React 18 + TypeScript**: Moderne UI-Entwicklung
- **Vite**: Schneller Build-Prozess
- **Tailwind CSS**: Utility-first Styling
- **Lucide React**: Icon-Library
- **Three.js**: 3D-Datei-Visualisierung

### Authentifizierung
- **Hybrid-System**: LDAP + MongoDB
- **Custom LDAP Client**: Keine externen Dependencies
- **JWT**: Token-basierte Authentifizierung (optional)

## 📦 Installation

### Voraussetzungen
- **Node.js** v16 oder höher
- **MongoDB** 8.0+ (lokal oder remote)
- Optional: **LDAP-Server** für zentrale Authentifizierung

### 1. Repository klonen
```bash
git clone https://github.com/match-Misc/match-werkstatt.git
cd match-werkstatt
```

### 2. Abhängigkeiten installieren
```bash
npm install
```

### 3. MongoDB einrichten

#### Windows
```powershell
# MongoDB installieren
winget install MongoDB.Server

# MongoDB-Service starten
net start MongoDB
```

#### Linux/Mac
```bash
# MongoDB installieren (Ubuntu/Debian)
sudo apt-get install mongodb-org

# MongoDB starten
sudo systemctl start mongod
```

Die Datenbank `matchdb` wird automatisch beim ersten Start erstellt.

### 4. Umgebungsvariablen (optional)
Erstellen Sie eine `.env` Datei für LDAP-Konfiguration:

```env
LDAP_HOST=ldap.company.local
LDAP_PORT=389
LDAP_BASE_DN=dc=company,dc=local
LDAP_USER_SEARCH_BASE=ou=users,dc=company,dc=local
```

**Hinweis**: Ohne LDAP-Konfiguration funktioniert das System vollständig mit MongoDB-Authentifizierung.

### 5. Anwendung starten

```bash
# Backend starten (Port 3001)
node server.cjs

# In einem neuen Terminal: Frontend starten (Port 5173)
npm run dev
```

Öffnen Sie `http://localhost:5173` im Browser.

### 6. Erster Login

**Standard-Admin-Account** (wird automatisch beim ersten Server-Start erstellt):
- Username: `admin`
- Password: `admin123`

**⚠️ Wichtig**: Bitte ändern Sie das Passwort nach dem ersten Login!

Der Standard-Admin wird nur erstellt, wenn noch kein Admin-Account in der Datenbank existiert.

## 👥 Benutzerrollen & Workflows

### 🛡️ Admin
- Vollständige System- und Benutzerverwaltung
- Netzwerk-Ordner-Konfiguration
- LDAP-Verwaltung und Synchronisation
- Alle Aufträge einsehen und verwalten
- Account-Verwaltung (Werkstatt & Kunden)

### 🔧 Werkstatt (WiMi - Wissenschaftliche Mitarbeiter)
- **Auftragsannahme**: Aufträge annehmen oder ablehnen
- **Bearbeitung**: Status-Updates und Zeiterfassung
- **Bauteile**: Komponenten mit Beschreibungen und Dokumenten verwalten
- **Revision**: Aufträge zur Überarbeitung zurückschicken
- **Teilaufgaben**: Aufgaben erstellen und Mitarbeitern zuweisen
- **CAM-Dateien**: Fertigungsdateien hochladen
- **Endabnahme**: Kunden zur Endabnahme auffordern

### 👤 Kunde
- **Aufträge erstellen**: Mit Bauteilen, Beschreibungen und Dateien
- **Status verfolgen**: Live-Tracking des Bearbeitungsstatus
- **Überarbeitung**: Bei Revision-Anfrage anpassen und neu einreichen
- **Endabnahme**: Fertige Aufträge bestätigen oder zur Nacharbeit schicken
- **Archiv**: Abgeschlossene Aufträge einsehen

## 🔄 Auftrags-Workflow

### 1. Auftragserstellung (Kunde)
```
Kunde → Neuer Auftrag → Titel, Beschreibung, Deadline, Kostenstelle, Priorität
      → Bauteile hinzufügen (Titel, Beschreibung, Dateien)
      → Dokumente hochladen
      → Absenden → Status: Pending
```

### 2. Auftragsannahme (Werkstatt)
```
WiMi → Dashboard → Auftrag prüfen
     → Annehmen → Status: Accepted
     → Oder: Ablehnen mit Begründung
```

### 3. Bearbeitung (Werkstatt)
```
WiMi → Status: In Progress
     → Teilaufgaben erstellen und zuweisen
     → Notizen hinzufügen
     → Arbeitsstunden erfassen
     → CAM-Dateien hochladen (optional)
```

### 4. Revision (optional)
```
WiMi → "Zur Überarbeitung" → Kommentar hinzufügen
     → Status: Revision
Kunde → Überarbeitungsfenster → Änderungen vornehmen
      → Neu einreichen → Status: Pending
```

### 5. Fertigstellung
```
WiMi → Status: Completed
     → "Zur Endabnahme" → Kunde wird benachrichtigt
Kunde → Endabnahme-Bestätigung
      → Oder: Nacharbeit anfordern (Status: Rework)
      → Nach Bestätigung: Status: Archived
```

## 📁 Dateimanagement & Netzwerk-Integration

### Netzwerk-Ordner-Migration
Aufträge können in Windows-Netzwerkfreigaben migriert werden:

```
\\server\Aufträge\
  ├── F-2601-1\
  │   ├── Auftrag_F-2601-1.pdf
  │   ├── Zeichnung.pdf
  │   ├── CAM\
  │   │   └── fertigungsdatei.step
  │   └── Bauteile\
  │       ├── Gehaeuse_Zeichnung.pdf
  │       └── Schraube_Modell.stl
  └── F-2601-2\
      └── ...
```

**Funktionen:**
- Automatische Ordnerstruktur-Erstellung
- Dateien nach Auftragsnummer organisiert
- Separate Ordner für CAM-Dateien und Bauteile
- Umlaute werden korrekt behandelt
- Original-Dateien werden nach Migration gelöscht

### 3D-Datei-Viewer
Unterstützte Formate:
- **STL**: Stereolithography
- **STEP/STP**: Standard für Produktdaten
- **OBJ, PLY, 3DS**: 3D-Mesh-Formate
- **GLTF/GLB**: GL Transmission Format

## 🗄️ Datenbankstruktur (MongoDB)

### Collections

**Order**
- Auftragsnummer (F-YYMM-X)
- Status, Priorität, Fristen
- Kunden- und Werkstatt-Zuweisungen
- Dokumente, Material-Status
- Revision-Historie, Endabnahme-Daten

**Component**
- Titel, Beschreibung, Material
- Stückzahl, Notizen
- Verknüpfung zu Order

**Document**
- Name, URL, Upload-Datum
- Verknüpfung zu Order oder Component
- Migrations-Status (lokal/Netzwerk)

**User**
- Username, Name, Rolle
- Passwort-Hash (für lokale Auth)
- LDAP-Status, Aktivierungsstatus

**NoteHistory**
- Historische Notizen zu Aufträgen
- Zeitstempel und Zuordnung

## 🔗 Wichtige API-Endpunkte

### Authentifizierung
- `POST /api/login` - Hybrid-Login (LDAP + MongoDB Fallback)
- `POST /api/register` - Kunden-Registrierung
- `GET /api/ldap/test` - LDAP-Verbindung testen (Admin)

### Auftragsverwaltung
- `GET /api/orders` - Alle Aufträge (mit Bauteilen und Dokumenten)
- `POST /api/orders` - Neuen Auftrag erstellen
- `GET /api/orders/:id` - Auftrag mit allen Relationen laden
- `PUT /api/orders/:id` - Auftrag aktualisieren (inkl. Bauteile)
- `DELETE /api/orders/:id` - Auftrag löschen
- `GET /api/orders/barcode/:code` - Auftrag per QR-Code finden

### Dateiverwaltung
- `POST /api/upload` - Datei hochladen (lokal)
- `POST /api/orders/:id/upload-cam-file` - CAM-Datei zu Netzwerk hochladen
- `POST /api/orders/:id/migrate-files` - Dateien zu Netzwerk migrieren
- `GET /api/orders/:id/migration-status` - Migrations-Status prüfen
- `GET /api/orders/:id/network-files` - Netzwerk-Dateien auflisten
- `DELETE /api/orders/:id/network-files/:filename` - Netzwerk-Datei löschen

### Benutzerverwaltung (Admin)
- `GET /api/users` - Alle Benutzer
- `POST /api/users` - Benutzer erstellen
- `PUT /api/users/:id` - Benutzer bearbeiten
- `DELETE /api/users/:id` - Benutzer löschen

### WebSocket-Events
- `order-created` - Neuer Auftrag erstellt
- `order-updated` - Auftrag aktualisiert
- `order-deleted` - Auftrag gelöscht

## 🚀 Produktions-Deployment

### Mit PM2 (empfohlen)
```bash
# PM2 installieren
npm install -g pm2

# Anwendung starten
pm2 start server.cjs --name "match-werkstatt"

# Auto-Start nach Reboot
pm2 startup
pm2 save

# Logs anzeigen
pm2 logs match-werkstatt

# Status prüfen
pm2 status
```

### Systemd Service (Linux)
```bash
# Service-Datei erstellen: /etc/systemd/system/match-werkstatt.service
[Unit]
Description=Match Werkstatt Server
After=network.target mongodb.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/match-werkstatt
ExecStart=/usr/bin/node server.cjs
Restart=always

[Install]
WantedBy=multi-user.target

# Service aktivieren
sudo systemctl enable match-werkstatt
sudo systemctl start match-werkstatt
```

### Reverse Proxy (nginx)
```nginx
server {
    listen 80;
    server_name werkstatt.example.com;

    # Frontend (statische Dateien)
    location / {
        root /opt/match-werkstatt/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 🔒 Sicherheit & Best Practices

### Authentifizierung
- Hybrid-System: LDAP-Authentifizierung mit MongoDB-Fallback
- Passwort-Hashing mit bcrypt (Rounds: 10)
- Automatischer Session-Timeout
- Geschützte API-Routen basierend auf Benutzerrollen

### Datei-Upload
- Validierung von Dateitypen und -größen
- Sichere Dateinamen (Sanitization)
- Separate Ordner für verschiedene Dateitypen
- Umlauts-korrekte Behandlung bei Netzwerk-Migration

### Datenbank
- MongoDB ohne externe ORM (direkte Treiber-Nutzung)
- ObjectId-Validierung
- Index-Optimierung für häufige Queries
- Automatische Backup-Empfehlung

## 📚 Weitere Dokumentation

- [LDAP-Setup](LDAP_SETUP.md) - Detaillierte LDAP-Konfiguration
- [MongoDB-Setup](MONGODB_SETUP.md) - Datenbank-Installation und Konfiguration
- [3D-Viewer](docs/3d-viewer.md) - 3D-Datei-Viewer-Dokumentation
- [Netzwerk-Migration](docs/network-migration.md) - Dateimigration zu Netzwerkfreigaben

## 🛠️ Entwicklung

### Projekt-Struktur
```
match-werkstatt/
├── server.cjs              # Express Backend-Server
├── simple-ldap-auth.cjs    # LDAP-Authentifizierung
├── src/
│   ├── main.tsx           # React Entry Point
│   ├── App.tsx            # Haupt-Komponente
│   ├── components/        # React-Komponenten
│   ├── context/           # React Context (State Management)
│   ├── types/             # TypeScript-Definitionen
│   └── utils/             # Hilfsfunktionen
├── storage/
│   ├── uploads/           # Lokale Datei-Uploads
│   └── cam-files/         # CAM-Dateien
├── scripts/
│   ├── seedUsers.cjs      # Benutzer-Seeds
│   └── deleteAllOrders.cjs # Aufträge löschen
└── public/                # Statische Assets
```

### Backend entwickeln
```bash
# Server mit Auto-Reload (nodemon)
npm install -g nodemon
nodemon server.cjs

# MongoDB-Logs anzeigen
tail -f /var/log/mongodb/mongod.log
```

### Frontend entwickeln
```bash
# Development-Server
npm run dev

# Build für Produktion
npm run build

# Preview Production Build
npm run preview
```

## 🤝 Mitwirkung

Beiträge sind willkommen! Bitte beachten Sie:

1. **Fork** das Repository
2. **Feature Branch** erstellen (`git checkout -b feature/NeuesFunktion`)
3. **Commit** mit aussagekräftiger Nachricht (`git commit -m 'feat: Bauteil-Duplikation hinzugefügt'`)
4. **Push** zum Branch (`git push origin feature/NeuesFunktion`)
5. **Pull Request** erstellen

### Code-Style
- TypeScript für Frontend
- ESLint-Regeln beachten
- Kommentare für komplexe Logik
- Keine Konsolenlogs in Production-Code

## 📝 Changelog

### Version 2.0 (Januar 2026)
- ✅ Migration von Prisma zu nativen MongoDB-Treibern
- ✅ Bauteilverwaltung mit separaten Dokumenten
- ✅ Netzwerk-Ordner-Integration
- ✅ 3D-Datei-Viewer (STL/STEP)
- ✅ Überarbeitetes Revision-System
- ✅ Material-Status-Tracking
- ✅ Endabnahme-Workflow

### Version 1.0
- Basis-Auftragsverwaltung
- LDAP-Integration
- QR-Code-System
- Benutzerrollen

## 📞 Support & Kontakt

- **Issues**: [GitHub Issues](https://github.com/match-Misc/match-werkstatt/issues)
- **Entwickler**: Maximilian Meyer

## 📄 Lizenz

MIT License - siehe [LICENSE](LICENSE) für Details

---

**Match-Werkstatt** - Professionelle Werkstattverwaltung mit MongoDB 🚀
