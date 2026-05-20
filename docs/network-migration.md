# Speicherstruktur & Dateimigration

Diese Dokumentation beschreibt die Datenhaltung, Dateimigration und Konfiguration des Netzwerklaufwerks (SMB/CIFS) in der Match-Werkstatt.

---

## 📁 Dateistruktur (Local & Netzwerk)

Die Match-Werkstatt organisiert hochgeladene Dateien nach einer einheitlichen Struktur. Diese Struktur wird sowohl **lokal** auf dem Server als auch auf dem **Netzwerklaufwerk** identisch abgebildet:

```
[Speicherpfad]/
├── uploads/
│   └── YYYY_MM_DD - Name des Auftrags/
│       ├── allgemeine-datei.pdf
│       └── [Name des Bauteils]/
│           └── bauteil-zeichnung.dwg
└── cam-files/
    └── YYYY_MM_DD - Name des Auftrags/
        └── OP1.gcode
```

### Ordnernamensgebung
- Der Ordnername eines Auftrags wird nach dem Muster `YYYY_MM_DD - Name des Auftrags` beim ersten Speichern automatisch generiert und in MongoDB unter dem Feld `networkFolderName` festgeschrieben. 
- Dies garantiert, dass der Ordnername im Dateisystem konsistent bleibt, selbst wenn der Auftragstitel später geändert wird.
- **Umlaute und Sonderzeichen** im Dateinamen werden normalisiert und Dateipfade URL-konform kodiert.
- **CAM-Dateien** werden direkt im CAM-Auftragsordner abgelegt, ohne weitere Unterordner zu erstellen.

---

## ⚙️ Konfiguration des Netzwerklaufwerks

Um ein Netzwerklaufwerk zu verwenden, muss der Pfad im Admin-Bereich hinterlegt und erreichbar sein.

### Schritt 1: Einbinden in Docker (Host-seitig)
Das Netzwerklaufwerk (z. B. SMB/CIFS oder NFS Share) sollte auf dem Docker-Host gemountet und per Volume in den Backend-Container durchgereicht werden. In der Standard `docker-compose.yml` ist dafür das Volume `/app/storage/network` vorgesehen.

Beispiel für den Host-Mount:
```bash
sudo mount -t cifs -o username=USER,password=PASS //192.168.1.100/Freigabe /path/to/local/mount
```

### Schritt 2: Aktivierung in der Weboberfläche
1. Navigieren Sie im System zu **Benutzerverwaltung / Einstellungen**.
2. Aktivieren Sie den Schalter **"Netzwerklaufwerk (SMB/CIFS) über Docker verwenden"**.
3. Geben Sie den absoluten Pfad im Backend-Container an (z. B. `/app/storage/network`).
4. Klicken Sie auf **"Verbindung Testen"**. Wenn die Verbindung erfolgreich ist, ist das Laufwerk einsatzbereit.

---

## 🚀 Dateimigration

Die Dateimigration sorgt dafür, dass temporär oder lokal hochgeladene Dateien automatisch in die strukturierte Ordnerablage verschoben werden.

### Automatische Migration (Auto-Migration)
Der Migrationsprozess läuft vollautomatisch im Hintergrund, sobald:
- Ein neuer Auftrag erstellt wird (`POST /api/orders`)
- Ein Auftrag bearbeitet/gespeichert wird (`PUT /api/orders/:id`)
- Eine neue Komponente zu einem Auftrag hinzugefügt wird (`POST /api/orders/:orderId/components`)

Das System prüft bei jedem Durchlauf:
1. **Netzwerk aktiv**: Die Dateien werden auf das Netzwerklaufwerk kopiert. Die Datenbank-Links werden auf `/network-files/...` umgeschrieben und der Status `migrated: true` gesetzt.
2. **Netzwerk inaktiv/offline**: Die Dateien werden in die lokale strukturierte Ordnerablage (`storage/uploads/...` und `storage/cam-files/...`) verschoben. Die Links verweisen weiterhin auf lokale Routen (`/uploads/...` bzw. `/cam-files/...`). Die Originaldateien im temporären Upload-Ordner werden gelöscht.

### Ausfallsicherheit (Offline-Resilienz)
Sollte das Netzwerklaufwerk temporär offline sein oder ausfallen:
- Das System fängt den Fehler ab und speichert/organisiert die Dateien stattdessen automatisch lokal.
- Sobald das Netzwerklaufwerk wieder online ist, führt das nächste Speichern des Auftrags oder das manuelle Triggern der Migration dazu, dass alle ausstehenden lokalen Dateien automatisch auf das Netzwerklaufwerk übertragen und die URLs aktualisiert werden.

### Manuelle Migration
In der Detailansicht eines Auftrags können Sie über den Button **"Dateien in Ordner migrieren"** eine sofortige Migration aller Dateien des Auftrags anstoßen.

### Migration Rückgängig machen (Rollback)
Falls das Netzwerklaufwerk deaktiviert oder getauscht werden soll, können Sie die Migration über den Button **"Migration rückgängig machen"** im Auftrag zurückrollen. 
- Hierbei werden alle Dateien physikalisch vom Netzwerklaufwerk zurück in die lokalen strukturierten Ordner des Servers kopiert.
- Die Datenbanklinks werden wieder auf die lokalen URLs `/uploads/...` bzw. `/cam-files/...` zurückgesetzt und als nicht migriert markiert.
