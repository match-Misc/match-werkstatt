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

## Option 3: Lokale Entwicklung mit Pixi

Für die lokale Entwicklung nutzen wir [Pixi](https://pixi.sh/), einen Paketmanager, der automatisch die richtige Node.js-Version und alle benötigten Abhängigkeiten bereitstellt.

### Voraussetzungen
- **[Pixi](https://pixi.sh/)** installiert.
- **MongoDB** lokal installiert oder über Docker gestartet.
- Optional: **LDAP-Server** für zentrale Authentifizierung.

### Schritte

**1. Repository klonen:**
```bash
git clone https://github.com/match-Misc/match-werkstatt.git
cd match-werkstatt
```

**2. Umgebungsvariablen konfigurieren:**
Erstelle eine `.local.env` Datei für die lokale Entwicklung:
```bash
cp .env.example .local.env
```
*Wichtig:* Passe die `.local.env` an und stelle sicher, dass die `MONGODB_URL` als komplett ausgeschriebener String hinterlegt ist (ohne Variablen-Interpolation wie `${MONGO_APP_USER}`), da der lokale Node-Parser dies nicht auflöst. Füge außerdem `DB_NAME=match-werkstatt-db` hinzu.

**3. MongoDB starten:**
Falls du MongoDB nicht lokal installiert hast, kannst du die Datenbank aus der Docker-Konfiguration im Hintergrund starten:
```bash
docker-compose up -d match-werkstatt-mongodb
```

**4. Dependencies installieren (Nur beim ersten Mal):**
Dieser Befehl installiert Node.js in der korrekten Version sowie alle NPM-Pakete:
```bash
pixi run install
```

**5. Anwendung starten:**
Mit einem einzigen Befehl startest du Frontend und Backend gleichzeitig in einem Terminal (dank `concurrently`):
```bash
pixi run dev
```

Öffne `http://localhost:5175` im Browser (oder die im Terminal angezeigte IP-Adresse, um über das Netzwerk darauf zuzugreifen).
