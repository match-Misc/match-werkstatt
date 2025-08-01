# 3D-Viewer für STL-Dateien

Diese Implementierung fügt einen interaktiven 3D-Viewer für STL-Dateien in das Match-Werkstatt-System ein.

## Funktionalitäten

### STLViewer Komponente
- **Interaktive 3D-Anzeige**: Vollständig navigierbare 3D-Ansicht mit Maus-/Touch-Steuerung
- **Auto-Rotation**: Optionale automatische Rotation des Modells
- **Farbauswahl**: Anpassbare Modellfarbe über Farbwähler
- **Vollbild-Modus**: Vergrößerte Ansicht für detaillierte Betrachtung
- **Beleuchtung**: Professionelle Beleuchtung mit mehreren Lichtquellen
- **Grid-Helper**: Raster zur besseren räumlichen Orientierung

### DocumentViewer Komponente
- **Automatische Erkennung**: Erkennt STL-Dateien automatisch
- **Dateityp-Icons**: Spezielle Icons für verschiedene Dateitypen (3D, CAD, PDF, etc.)
- **Ein-/Ausblendbare Vorschau**: 3D-Vorschau kann bei Bedarf angezeigt werden
- **Download-Funktionalität**: Weiterhin verfügbare Download-Option

## Unterstützte Dateiformate

### Derzeit implementiert:
- **STL** (.stl) - Vollständige 3D-Vorschau mit interaktiver Navigation

### Geplant für zukünftige Erweiterungen:
- **OBJ** (.obj) - 3D-Objektdateien
- **PLY** (.ply) - Stanford-Polygon-Format
- **GLTF/GLB** (.gltf, .glb) - Moderne 3D-Formate

## Technische Details

### Verwendete Bibliotheken:
- **Three.js**: 3D-Rendering-Engine
- **React-Three-Fiber**: React-Integration für Three.js
- **@react-three/drei**: Hilfskomponenten für React-Three-Fiber

### Steuerung:
- **Maus links ziehen**: Modell rotieren
- **Mausrad**: Zoomen
- **Maus rechts ziehen**: Kamera verschieben
- **Farbwähler**: Modellfarbe ändern
- **Rotation-Button**: Auto-Rotation ein/aus
- **Vollbild-Button**: Maximierte Ansicht

### Performance-Optimierungen:
- **Lazy Loading**: 3D-Modelle werden nur bei Bedarf geladen
- **Automatische Skalierung**: Modelle werden auf optimale Größe normalisiert
- **Zentrale Positionierung**: Modelle werden automatisch zentriert
- **Normal-Berechnung**: Optimierte Beleuchtung durch automatische Normal-Generierung

## Integration

### In OrderDetails.tsx:
```tsx
import DocumentViewer from './DocumentViewer';

// Ersetzt die alte Dokumentanzeige
<DocumentViewer
  document={doc}
  onDownload={handleDownload}
  showPreview={true}
  className="shadow-sm"
/>
```

### In WorkshopOrderDetails.tsx:
```tsx
// Gleiche Integration für Werkstatt-Ansicht
<DocumentViewer
  document={doc}
  onDownload={handleDownload}
  showPreview={true}
  className="border-l-4 border-l-blue-500"
/>
```

## Benutzerführung

1. **STL-Datei hochladen**: Normale Upload-Funktionalität verwenden
2. **3D-Ansicht aktivieren**: Button "3D anzeigen" klicken
3. **Navigation**: Mit Maus das Modell erkunden
4. **Anpassungen**: Farbe und Rotation nach Belieben einstellen
5. **Vollbild**: Für detaillierte Betrachtung Vollbild-Modus nutzen

## Fehlerbehebung

### Häufige Probleme:
- **Datei lädt nicht**: Prüfen ob STL-Datei gültig ist
- **Modell zu klein/groß**: Automatische Skalierung sollte dies verhindern
- **Performance-Probleme**: Bei sehr großen STL-Dateien kann das Laden länger dauern

### Browser-Kompatibilität:
- **Chrome**: Vollständig unterstützt
- **Firefox**: Vollständig unterstützt  
- **Safari**: Vollständig unterstützt
- **Edge**: Vollständig unterstützt

## Zukünftige Erweiterungen

- **Messtools**: Distanz- und Winkelmessungen
- **Schnittebenen**: Querscnitte durch das Modell
- **Animationen**: Explosionsdarstellungen für Baugruppen
- **Export**: Screenshots und weitere Exportformate
- **Kollaborative Annotation**: Markierungen und Kommentare im 3D-Raum
