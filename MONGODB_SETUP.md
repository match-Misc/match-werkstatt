# MongoDB Setup - Installationsanleitung

## Option 1: Mit Docker Desktop (empfohlen)

1. **Docker Desktop starten**
   - Öffne Docker Desktop aus dem Startmenü
   - Warte bis Status "Running" anzeigt

2. **MongoDB Container starten**
   ```bash
   docker-compose up -d
   ```

3. **Überprüfen**
   ```bash
   docker ps
   ```

4. **Mongo Express Web-UI öffnen**
   - http://localhost:8081

---

## Option 2: Lokale Installation (ohne Docker)

### Windows-Installation

1. **MongoDB Community Edition herunterladen**
   - https://www.mongodb.com/try/download/community
   - Version: 7.x für Windows
   - Als Windows Service installieren

2. **Installation starten**
   - Installiere MongoDB als Service
   - Standard-Port: 27017
   - Datenverzeichnis: `C:\Program Files\MongoDB\Server\7.0\data`

3. **MongoDB Compass installieren** (optional - GUI für MongoDB)
   - https://www.mongodb.com/try/download/compass
   - Verbindung: `mongodb://localhost:27017`

4. **.env anpassen** (keine Authentifizierung)
   ```env
   DATABASE_URL="mongodb://localhost:27017/matchdb"
   ```

### Service-Befehle (Windows)

```powershell
# MongoDB-Service starten
net start MongoDB

# MongoDB-Service stoppen
net stop MongoDB

# Service-Status prüfen
Get-Service MongoDB
```

### Verbindung testen

```powershell
# Mit mongosh (MongoDB Shell)
mongosh "mongodb://localhost:27017/matchdb"
```

---

## Datenbank initialisieren

Wenn Sie lokale Installation verwenden, erstellen Sie Indizes manuell:

```javascript
// In mongosh ausführen
use matchdb

// Collections erstellen
db.createCollection('Order')
db.createCollection('User')
db.createCollection('Document')
db.createCollection('Component')
db.createCollection('ComponentDocument')
db.createCollection('NoteHistory')
db.createCollection('SystemConfig')
db.createCollection('settings')

// Indizes werden automatisch beim Server-Start erstellt
```

---

## Server starten

Nach MongoDB-Setup:

```bash
node server.cjs
```

Der Server erstellt automatisch alle benötigten Indizes beim Start.
