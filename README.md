# Match-Werkstatt 🔧

<div align="center">

![Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)
![MongoDB](https://img.shields.io/badge/MongoDB-8.0+-green.svg)

Ein umfassendes Auftragsmanagement-System für Werkstätten mit moderner Web-Technologie, Bauteilverwaltung, Netzwerk-Dateiintegration und flexibler Hybrid-Authentifizierung.

</div>

---

## 🚀 Quick-Start (Docker)

Die einfachste und empfohlene Methode, die Match-Werkstatt in Betrieb zu nehmen, ist via Docker. Wir stellen automatisch erstellte Multi-Architektur-Images bereit.

```bash
# 1. Repository klonen
git clone https://github.com/match-Misc/match-werkstatt.git
cd match-werkstatt

# 2. Umgebungsvariablen kopieren und anpassen
cp .env.example .env
# WICHTIG: Passe in der .env die MongoDB-Passwörter an!

# 3. Datenbank-Initialisierungsscript vorbereiten
# SEHR WICHTIG: Die mongo-init.js Datei muss zwingend neben der docker-compose.yml liegen!
# (Sie befindet sich bereits im Root-Verzeichnis des Repositories)

# 4. Starten
docker compose up -d
```
Anschließend ist die Match-Werkstatt unter `http://localhost:5007` erreichbar. 

Weitere Installationsmethoden (z.B. lokale Entwicklung mit Pixi) findest du in der [Installationsanleitung](docs/installation.md).

---

## 📑 Dokumentation

Alle detaillierten Informationen zur Einrichtung, Konfiguration und Nutzung findest du in unserem `docs/` Ordner:

- 📥 **[Installation](docs/installation.md)**: Docker (GHCR), Docker Self-Build & Lokale Entwicklung mit Pixi
- ⚙️ **[Konfiguration](docs/configuration.md)**: Environment Variables & Setup
- 🔐 **[LDAP-Setup](docs/ldap-setup.md)**: Details zur Hybrid-Authentifizierung
- 🗄️ **[MongoDB-Setup](docs/mongodb-setup.md)**: Manuelle Datenbank-Installation
- 💾 **[Backup & Restore](docs/backup-and-restore.md)**: Automatisierte Backups konfigurieren und wiederherstellen
- 📁 **[Netzwerk-Migration](docs/network-migration.md)**: Dateimigration zu Netzwerkfreigaben
- 🧊 **[3D-Viewer](docs/3d-viewer.md)**: 3D-Datei-Viewer-Dokumentation
- 📚 **[API-Dokumentation](docs/api.md)**: Übersicht aller Backend-Endpunkte
- 🚢 **[Deployment](docs/deployment.md)**: PM2, Systemd und Nginx Deployment
- 🛠️ **[Entwicklung](docs/development.md)**: NPM-Scripts, Projekt-Struktur und Contributing

---

## ✨ Features im Überblick

### 🎯 Kernfunktionen
- **🔐 Hybrid-Authentifizierung:** LDAP-Integration mit MongoDB-Fallback. Funktioniert vollständig ohne LDAP.
- **📋 Auftragsverwaltung:** Bauteilverwaltung, Überarbeitungssystem, QR-Code-System und Status-Tracking.
- **📁 Datei- & Netzwerkverwaltung:** Automatische Dateimigration zu Windows-Netzwerkfreigaben, CAM-Dateien, 3D-Viewer (STL/STEP) und Drag & Drop.
- **🔧 Werkstatt-Features:** Automatische Auftragsnummern, Zeiterfassung, Teilaufgaben und Mitarbeiterverwaltung.

### 👥 Benutzerrollen
- **🛡️ Admin:** System- und Benutzerverwaltung, Netzwerk-Konfiguration.
- **🔧 Werkstatt (WiMi):** Auftragsannahme, Bearbeitung, Bauteile verwalten, CAM-Dateien hochladen, Endabnahme fordern.
- **👤 Kunde:** Aufträge erstellen, Status verfolgen, Überarbeitung und Endabnahme.

---

## 🛠️ Technologie-Stack

- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, Lucide React, Three.js
- **Backend:** Node.js, Express.js, Native MongoDB Driver, WebSocket, Multer
- **Datenbank:** MongoDB 8.0+
- **Sicherheit:** Hybrid-LDAP + MongoDB, JWT, bcrypt Password Hashing
- **Deployment:** Docker, GitHub Container Registry (GHCR)

---

## 📞 Kontakt & Support

- **GitHub Repository**: [https://github.com/match-Misc/match-werkstatt](https://github.com/match-Misc/match-werkstatt)
- **Issues**: [GitHub Issues](https://github.com/match-Misc/match-werkstatt/issues)
- **Entwickler**: Maximilian Meyer

## 📄 Lizenz

MIT License - siehe [LICENSE](LICENSE) für Details

<div align="center">
<b>Match-Werkstatt</b> - Professionelle Werkstattverwaltung mit MongoDB 🚀<br>
</div>
