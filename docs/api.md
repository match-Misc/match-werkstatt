# 📚 API-Dokumentation

Die API-Endpunkte können lokal standardmäßig über `http://localhost:3001/api` oder in der Docker-Umgebung über `/api` (via Nginx Reverse Proxy) erreicht werden.

---

## Authentifizierung

- `POST /api/login` - Hybrid-Login (LDAP + MongoDB Fallback)
- `POST /api/register` - Kunden-Registrierung
- `GET /api/ldap/test` - LDAP-Verbindung testen (Admin)

---

## Auftragsverwaltung

- `GET /api/orders` - Alle Aufträge (mit Bauteilen und Dokumenten)
- `POST /api/orders` - Neuen Auftrag erstellen
- `POST /api/orders/:id/duplicate` - Zugänglichen Auftrag als eigenständigen Entwurf duplizieren (gültige Sitzung erforderlich). HTTP 201 liefert `id`, `orderNumber`, `status`. Angaben und Dateien werden kopiert; tatsächliche Stunden und Bearbeitungsstatus werden standardmäßig zurückgesetzt. `duplicatedFrom` hält ID und Nummer des Originals fest.
- `GET /api/orders/:id` - Auftrag mit allen Relationen laden
- `PUT /api/orders/:id` - Auftrag aktualisieren (inkl. Bauteile)
- `DELETE /api/orders/:id` - Auftrag löschen
- `DELETE /api/drafts/:id` - Entwurf mit Angaben und Anhängen löschen. Gültige Sitzung erforderlich; Auftraggeber dürfen nur eigene Entwürfe löschen. Bereits eingereichte Aufträge und fremde Entwürfe werden abgewiesen.
- `GET /api/orders/barcode/:code` - Auftrag per QR-Code finden

Auftraggeber erhalten keine internen Werkstattnotizen und keine geschätzten oder tatsächlichen Stunden; das gilt auch für Unteraufgaben.

Admin und Werkstattleitung können `completed` und `archived` über `PUT /api/orders/:id` mit `{ "status": "in_progress" }` wieder starten. Dabei werden Endabnahme und Erinnerungsstatus zurückgesetzt. Zeiten und Unteraufgaben bleiben erhalten; archivierte Auftragsordner werden über den bestehenden Archivmechanismus zurückverschoben.

---

## Dateiverwaltung

- `POST /api/upload` - Datei hochladen (lokal)
- `POST /api/orders/:id/upload-cam-file` - CAM-Datei zu Netzwerk hochladen
- `POST /api/orders/:id/migrate-files` - Dateien zu Netzwerk migrieren
- `GET /api/orders/:id/migration-status` - Migrations-Status prüfen
- `GET /api/orders/:id/network-files` - Netzwerk-Dateien auflisten
- `DELETE /api/orders/:id/network-files/:filename` - Netzwerk-Datei löschen

---

## Benutzerverwaltung (Admin und Werkstattleitung)

- `GET /api/users` - Alle Benutzer abrufen
- `POST /api/users` - Benutzer erstellen
- `PUT /api/users/:id` - Benutzer bearbeiten; persönliche Spaltenkonfiguration mit `tableConfig` (Sichtbarkeit) und `tableColumnOrder` (Objekt mit Tabellen-ID → Liste von Spalten-IDs) speichern
- `DELETE /api/users/:id` - Benutzer löschen

---

## WebSocket-Events

- `order-created` - Neuer Auftrag erstellt
- `order-updated` - Auftrag aktualisiert
- `order-deleted` - Auftrag gelöscht
