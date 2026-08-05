# E2E Test Übersicht

Dieses Dokument gibt eine detaillierte Übersicht über alle automatisierten End-to-End (E2E) Tests im System. Die Tests stellen sicher, dass Berechtigungen (RBAC), UI-Workflows und Datenkonsistenz für alle Benutzerrollen korrekt funktionieren.

## Test-Dateien

Aktuell gibt es drei primäre Test-Dateien im `e2e/` Ordner:

1. **`login.spec.ts`**: Grundlegender Login-Test.
2. **`cost-center.spec.ts`**: Testet die Verwaltung, Erstellung und Auswahl von Kostenstellen.
3. **`create-order.spec.ts`**: Testet den kompletten Workflow zur Auftragserstellung inklusive Dateiuploads und Bauteil-Verwaltung.

---

## 1. Login Tests (`login.spec.ts`)

Diese Tests stellen sicher, dass die Authentifizierung und Weiterleitung grundlegend funktionieren.

| Testfall | Beschreibung | Getestete Rollen |
| :--- | :--- | :--- |
| **Login erfolgreich** | Ein normaler Benutzer (`Auftraggeber`) gibt gültige Zugangsdaten ein und wird erfolgreich auf das Dashboard weitergeleitet. | `Auftraggeber` |

---

## 2. Kostenstellen & RBAC (`cost-center.spec.ts`)

Diese Suite iteriert durch **alle Rollen** (Admin, Werkstattleitung, Werkstattmitarbeiter, Auftraggeber, Gast) und testet deren spezifische Berechtigungen im Umgang mit Kostenstellen.

| Testfall | Beschreibung | Erwartetes Verhalten nach Rolle |
| :--- | :--- | :--- |
| **Kostenstellen in Einstellungen verwalten** | Navigation zur `/settings` Seite und Versuch, das Tab "Kostenstellen" zu sehen oder zu bearbeiten. | **Erlaubt:** `Admin`, `Werkstattleitung`<br>**Blockiert:** `Werkstattmitarbeiter`, `Auftraggeber`, `Gast` |
| **Kostenstelle bei Auftragserstellung** | Versuch, eine bestehende Kostenstelle auszuwählen, eine neue Kostenstelle im Modal zu erstellen und absichtlich eine doppelte Nummer anzulegen. | **Erlaubt (inkl. Fehler bei Duplikat):** `Admin`, `Werkstattleitung`, `Werkstattmitarbeiter`, `Auftraggeber`<br>**Blockiert (kein Button sichtbar):** `Gast` |
| **Admin UI Cleanup Test** | (Separater Test) Ein Admin legt eine Kostenstelle per API an, navigiert in die UI-Einstellungen, löscht die Kostenstelle manuell über den "Löschen"-Button und prüft, ob sie verschwindet. | `Admin` |

---

## 3. Auftragserstellung (`create-order.spec.ts`)

Diese Suite iteriert ebenfalls durch **alle Rollen** und testet den komplexen Workflow der Auftragserstellung. Die erstellten Aufträge werden nach jedem Test automatisch über die API aus der Datenbank gelöscht (Cleanup).

> [!NOTE]
> Die Rolle `Gast` wird hierbei explizit so getestet, dass sie keine Buttons zur Auftragserstellung sieht (Test wird danach abgebrochen bzw. geskippt). Alle anderen Rollen durchlaufen den kompletten Prozess.

| Testfall | Beschreibung | Workflow & Prüfungen |
| :--- | :--- | :--- |
| **Neuer Auftrag (ohne Bauteile)** | Erstellung eines simplen Auftrags. | 1. Titel, Beschreibung, Deadline eingeben<br>2. Neue Kostenstelle anlegen und auswählen<br>3. Einreichen<br>4. Bestätigungsmodal ("Ohne Bauteil") akzeptieren<br>5. Prüfung, ob Auftrag im Dashboard erscheint |
| **Auftrag mit Bauteilen** | Erstellung eines Auftrags inklusive mehrerer Bauteile. | 1. Grunddaten & Kostenstelle ausfüllen<br>2. Zwei separate Bauteile über "Bauteil hinzufügen" anlegen<br>3. Einreichen (hier darf **kein** Warnmodal kommen!)<br>4. Navigation in die Detailansicht und Überprüfung der Bauteile im "Bauteilübersicht" Tab |
| **Uploads (Allgemein & am Bauteil)** | Test der Datei-Uploads und des physischen Dateisystems inkl. Umlauten. | 1. Grunddaten & Kostenstelle ausfüllen<br>2. Ein allgemeines PDF hochladen<br>3. Ein Bild (`.png`) mit Umlauten im Namen hochladen<br>4. Ein Bauteil anlegen und ein 3D-Modell (`.stl`) direkt an das Bauteil hängen<br>5. Einreichen & API-Response validieren<br>6. Prüfung der Detailansicht und des Bild-Vorschau-Overlays<br>7. **Physische Prüfung:** Überprüfung, ob die Ordnerstruktur (Netzwerkordner, Bauteil-Ordner) im `storage/` Verzeichnis des Servers existiert und die Dateien fehlerfrei abgelegt wurden |

## Zusammenfassung der RBAC Erwartungen

| Aktion | Admin | Werkstattleitung | Mitarbeiter | Auftraggeber | Gast |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Login** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Einstellungen verwalten** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Aufträge erstellen** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Kostenstelle anlegen** | ✅ | ✅ | ✅ | ✅ | ❌ |
