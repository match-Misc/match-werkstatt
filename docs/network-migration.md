# Speicherstruktur & Dateimigration

Diese Dokumentation beschreibt die Datenhaltung, Dateimigration und Konfiguration des Netzwerklaufwerks (SMB/CIFS) in der Match-Werkstatt.

---

## 📁 Ordnerstruktur

Alle Dateien eines Auftrags werden in einem einzigen `uploads/`-Verzeichnis organisiert. Die Struktur ist lokal und auf dem Netzwerklaufwerk identisch:

```
uploads/
└── F-2605-1 - Auftragsname/
    ├── allgemeine-datei.pdf          ← Direkt auf Auftragsebene (z.B. Angebote, Zeichnungen)
    ├── 00_Interne Dokumente/         ← Interne Daten (CAM, NC, STL, etc.)
    │   ├── 3d-modell.stl
    │   └── fräsprogramm.nc
    ├── 01_Motorhalterung/            ← Bauteil 1 (01_ = 1. Bauteil)
    │   ├── zeichnung.dwg
    │   └── bauteil.pdf
    └── 02_Antriebswelle/             ← Bauteil 2 (02_ = 2. Bauteil)
        └── toleranzblatt.xlsx
```

### Ordnernamensgebung

| Typ                 | Schema                        | Beispiel                      |
|---------------------|-------------------------------|-------------------------------|
| Auftragsordner      | `Auftragsnummer - Titel`      | `F-2605-1 - Mein Auftrag`     |
| Interne Dokumente   | `00_Interne Dokumente`        | Immer an erster Stelle        |
| Bauteil-Ordner      | `NN_Bauteilname`              | `01_Motorhalterung`           |

- **Ordnername wird einmalig generiert** und in MongoDB unter `networkFolderName` gespeichert — Titeländerungen haben keinen Einfluss auf das Dateisystem.
- **Bauteil-Nummerierung** richtet sich nach der Erstellungsreihenfolge der Bauteile (`createdAt` aufsteigend).
- **Sonderzeichen** (`\ / : * ? " < > |`) werden in Ordnernamen durch `_` ersetzt.

---

## ⚙️ Konfiguration des Netzwerklaufwerks

### Schritt 1: Docker-Volume konfigurieren

Das Netzwerklaufwerk (SMB/CIFS oder NFS) wird auf dem Docker-Host eingebunden und via Volume an den Container durchgereicht. Nur ein Volume ist nötig — `uploads_data` enthält die gesamte Dateiablage.

Beispiel Host-Mount (SMB):
```bash
sudo mount -t cifs -o username=USER,password=PASS //192.168.1.100/Freigabe /mnt/werkstatt
```

In der `docker-compose.yml` sind folgende Volumes definiert:
```yaml
volumes:
  - uploads_data:/app/storage/uploads    # Alle Dateien (lokal + Netzwerk)
  - network_data:/app/storage/network    # Optionales SMB-Mount
```

### Schritt 2: Aktivierung in der Weboberfläche

1. Navigieren Sie zu **Benutzerverwaltung → Einstellungen**.
2. Aktivieren Sie den Schalter **„Netzwerklaufwerk (SMB/CIFS) über Docker verwenden"**.
3. Geben Sie den **absoluten Container-Pfad** an, z.B. `/app/storage/network`.
4. Klicken Sie auf **„Verbindung Testen"** — bei Erfolg ist das Laufwerk einsatzbereit.

---

## 🚀 Dateimigration (Automatisch)

Die Migration wird automatisch ausgelöst bei:
- **Auftrag erstellen** (`POST /api/orders`)
- **Auftrag speichern** (`PUT /api/orders/:id`)
- **Bauteil hinzufügen** (`POST /api/orders/:orderId/components`)

**Wenn Netzwerk aktiv:** Dateien werden in die strukturierten Ordner auf dem Netzwerklaufwerk kopiert. DB-URLs werden auf `/network-files/uploads/...` umgeschrieben.

**Wenn Netzwerk offline:** Dateien werden lokal in `storage/uploads/ORDNER/` organisiert. Das System arbeitet vollständig ohne Netzwerk weiter.

---

## 🔄 Transition & Ausfallsicherheit

| Szenario | Verhalten |
|----------|-----------|
| Netzwerk aktiviert (erste Migration) | Beim nächsten Speichern werden alle lokalen Dateien auf das Netzlaufwerk übertragen |
| Netzwerk temporär offline | Neue Dateien werden lokal gespeichert; nach Rückkehr des Netzwerks werden sie beim nächsten Speichern migriert |
| Manuelle Migration | Button „Dateien migrieren" in der Auftragsdetailansicht |
| Migration rückgängig machen | Button „Migration rückgängig machen" — kopiert Dateien zurück in `storage/uploads/` und stellt lokale URLs wieder her |
