# Dateimigration für Netzwerkordner

Diese Dokumentation beschreibt den Prozess und die Funktionalität für die Migration von Dateien in die Netzwerkordnerstruktur.

## Funktionalität

Die Dateimigration ermöglicht das automatische Kopieren von im System gespeicherten Dateien in eine organisierte Netzwerkordnerstruktur. Diese Funktion wird automatisch ausgeführt, wenn:

1. Ein Netzwerkordner für einen Auftrag erstellt wird
2. Manuell über die Benutzeroberfläche die Migration angestoßen wird

## Ordnerstruktur

Die Migration erstellt für jeden Auftrag die folgende Ordnerstruktur:

```
Auftragsnummer/
├── CAD_CAM/              # CAD/CAM-Dateien (.dxf, .dwg, .stl, .step, .gcode, etc.)
├── Zeichnungen/          # Technische Zeichnungen
├── Dokumentation/        # Technische Dokumentation, Anleitungen, etc.
├── Bilder/               # Fotos und Bilder
├── Dokumente/            # Sonstige Dokumente (Office, etc.)
├── Archiv/               # Archivierte Dateien
└── Bauteile/             # Komponenten des Auftrags
    ├── Bauteil1/
    │   ├── CAD_CAM/      # Bauteilspezifische CAD/CAM-Dateien
    │   ├── Zeichnungen/  # Bauteilspezifische Zeichnungen
    │   ├── Dokumentation/# Bauteilspezifische Dokumentation
    │   ├── Bilder/       # Bauteilspezifische Bilder
    │   └── Dokumente/    # Sonstige bauteilspezifische Dokumente
    └── Bauteil2/
        ├── ...
```

## Verwendung

### Automatische Migration

Bei der Erstellung eines Netzwerkordners werden bestehende Dateien automatisch migriert.

### Manuelle Migration

Die Migration kann manuell für jeden Auftrag angestoßen werden:

1. Öffnen Sie die Auftragsdetails
2. Im Bereich "Netzwerkordner" klicken Sie auf "Dateien in Ordner migrieren"

### Batch-Migration aller Aufträge

Das Skript `migrate-all-files.js` ermöglicht die Migration aller Aufträge auf einmal:

```bash
node migrate-all-files.js
```

## Technische Details

### Dateitypenerkennung

Die Migration erkennt Dateitypen anhand der Dateiendung und sortiert sie in entsprechende Unterordner:

- **CAD/CAM-Dateien**: .dxf, .dwg, .stl, .step, .stp, .iges, .igs, .x_t, .gcode
- **Bilder**: .jpg, .jpeg, .png, .gif, .bmp, .tif, .tiff
- **PDF-Dokumente**: .pdf (standardmäßig in "Dokumentation")
- **Office-Dokumente**: .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt, .csv

### Migrationsablauf

1. Lese alle Dokumente des Auftrags und seiner Komponenten
2. Bestimme für jede Datei den korrekten Zielordner basierend auf Dateityp
3. Kopiere Dateien in die entsprechenden Unterordner
4. Aktualisiere die Datenbank mit dem Migrationsstatus

## Fehlerbehebung

Bei Problemen mit der Migration:

1. Überprüfen Sie, ob der konfigurierte Netzwerkpfad erreichbar ist
2. Stellen Sie sicher, dass ausreichende Berechtigungen für den Zugriff bestehen
3. Überprüfen Sie die Server-Logs für detaillierte Fehlermeldungen
