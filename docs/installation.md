# 🚀 Installation

Es gibt verschiedene Möglichkeiten, die Match-Werkstatt zu installieren. Wir empfehlen die Nutzung unserer vorkompilierten Docker-Images für die einfachste und sicherste Einrichtung.

---

## Option 1: Docker mit vorkompilierten Images (Empfohlen)

Dieses Projekt nutzt GitHub Actions, um bei jedem Release automatisch Multi-Architektur Docker-Images (für `linux/amd64` und `linux/arm64` wie den Raspberry Pi 5) zu erstellen, zu signieren und in die GitHub Container Registry (GHCR) hochzuladen. 

Die mitgelieferte `docker-compose.yml` ist bereits darauf konfiguriert, diese Images zu nutzen.

### Voraussetzungen
- [Docker](https://docs.docker.com/get-docker/) und Docker Compose
- Git

### Schritte

**1. Repository klonen:**
```bash
git clone https://github.com/match-Misc/match-werkstatt.git
cd match-werkstatt
```

**2. Umgebungsvariablen konfigurieren:**
```bash
cp .env.example .env
```
Öffne die `.env`-Datei und passe mindestens die MongoDB-Passwörter (`MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD`) an.

**3. Initialisierung der Datenbank:**
> [!IMPORTANT]
> **SEHR WICHTIG:** Die Datei `mongo-init.js` muss zwingend neben der `docker-compose.yml` liegen! Sie wird für die korrekte Anlage der Datenbank-Benutzer beim ersten Start benötigt. Sie befindet sich bereits im Root-Verzeichnis des Repositories, stelle nur sicher, dass sie nicht gelöscht oder verschoben wird.

**4. Container starten:**
```bash
docker compose up -d
```

**5. Zugriff:**
- Frontend: `http://localhost:5007` (oder die IP-Adresse des Servers)
- Erster Login (Standard-Admin-Account, wird automatisch erstellt):
  - Username: `admin`
  - Password: `admin123`
  - **⚠️ Wichtig**: Bitte ändern Sie das Passwort nach dem ersten Login!

---

## Option 2: Docker - Lokaler Build (Self-Build)

Möchtest du eigene Anpassungen am Code vornehmen und die Docker-Images selbst bauen, kannst du die Build-Konfiguration nutzen.

### Schritte

**1. Repository klonen und konfigurieren:**
```bash
git clone https://github.com/match-Misc/match-werkstatt.git
cd match-werkstatt
cp .env.example .env
```
Wiederum beachten, dass die `mongo-init.js` im Verzeichnis liegen bleibt.

**2. Build und Start:**
```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```
*Die `docker-compose.build.yml` überschreibt die Image-Referenzen und nutzt stattdessen das lokale `Dockerfile`.*

---

## Option 3: Manuelle Installation (Ohne Docker - für Entwicklung)

Diese Methode wird hauptsächlich für die lokale Entwicklung empfohlen.

### Voraussetzungen
- **Node.js** (v16 oder höher)
- **MongoDB** (v8.0 oder höher)
- Optional: **LDAP-Server** für zentrale Authentifizierung

### Schritte

**1. Repository klonen und Dependencies installieren:**
```bash
git clone https://github.com/match-Misc/match-werkstatt.git
cd match-werkstatt
npm install
```

**2. MongoDB einrichten:**
Details zur lokalen MongoDB-Installation findest du im [MongoDB Setup](mongodb-setup.md).

**3. Umgebungsvariablen konfigurieren:**
```bash
cp .env.example .env
```
Konfiguriere ggf. die LDAP-Zugangsdaten in der `.env`. Ohne LDAP-Konfiguration funktioniert das System vollständig mit MongoDB-Authentifizierung.

**4. Anwendung starten:**
```bash
# Backend starten (Port 3001)
node server.cjs

# In einem neuen Terminal: Frontend starten (Port 5173)
npm run dev
```

Öffnen Sie `http://localhost:5173` im Browser. Auch hier ist der Standard-Login `admin` / `admin123`.
