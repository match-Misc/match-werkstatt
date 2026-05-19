# 💾 Backup und Restore

Die Match-Werkstatt beinhaltet eine automatisierte Backup-Strategie, um Datenverlust zu vermeiden.

## Automatisierte Backups

In der `docker-compose.yml` ist ein spezieller Sidecar-Container (`match-werkstatt-mongo-backup`) definiert, der sich um tägliche Sicherungen der MongoDB-Datenbank kümmert.

### Funktionsweise
- Es wird ein täglicher Dump der Datenbank als gezipptes Archiv (`.archive`) erstellt.
- Standardmäßig wird das Backup um `03:00` Uhr nachts ausgeführt (konfigurierbar über `BACKUP_TIME` in der `.env`).
- Die Backups werden im Host-Verzeichnis abgelegt (Standard: `./backups`, konfigurierbar über `BACKUP_DIR`).
- Eine Retention Policy löscht alte Backups automatisch, um Speicherplatz zu sparen. Es werden die letzten `BACKUP_RETAIN_COUNT` (Standard: 7) Backups behalten.

### Konfiguration (`.env`)
```env
BACKUP_DIR=./backups
BACKUP_TIME=03:00
BACKUP_RETAIN_COUNT=7
TZ=Europe/Berlin
```

---

## Manuelle Wiederherstellung (Restore)

Solltest du ein Backup wiederherstellen müssen, kannst du den `mongorestore` Befehl im laufenden Datenbank-Container ausführen.

### Warnung
Beim Restore mit dem Parameter `--drop` werden **alle aktuellen Daten** in der Datenbank durch den Stand des Backups ersetzt. Stelle sicher, dass du das richtige Backup ausgewählt hast.

### Wiederherstellung durchführen

1. Gehe in das Verzeichnis, in dem deine `docker-compose.yml` liegt.
2. Identifiziere die Backup-Datei, die du wiederherstellen möchtest (z.B. `./backups/werkstatt-backup-20260516_235800.archive`).
3. Führe den folgenden Befehl aus (passe den Pfad zur Backup-Datei am Ende des Befehls an):

```bash
source .env && docker compose exec -T match-werkstatt-mongodb mongorestore \
  --username="${MONGO_ROOT_USER:-admin}" \
  --password="${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase=admin \
  --archive \
  --gzip \
  --drop \
  < ./backups/werkstatt-backup-20260516_235800.archive
```
*(Hinweis: Der Pfad `./backups/werkstatt-backup-...` bezieht sich auf das Verzeichnis auf deinem Host-System, von wo aus du den Befehl ausführst)*

### Überprüfung
Nach der Wiederherstellung solltest du die Anwendung überprüfen, um sicherzustellen, dass die Daten (Aufträge, Bauteile, Benutzer) korrekt geladen wurden.
