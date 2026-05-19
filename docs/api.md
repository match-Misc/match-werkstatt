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
- `GET /api/orders/:id` - Auftrag mit allen Relationen laden
- `PUT /api/orders/:id` - Auftrag aktualisieren (inkl. Bauteile)
- `DELETE /api/orders/:id` - Auftrag löschen
- `GET /api/orders/barcode/:code` - Auftrag per QR-Code finden

---

## Dateiverwaltung

- `POST /api/upload` - Datei hochladen (lokal)
- `POST /api/orders/:id/upload-cam-file` - CAM-Datei zu Netzwerk hochladen
- `POST /api/orders/:id/migrate-files` - Dateien zu Netzwerk migrieren
- `GET /api/orders/:id/migration-status` - Migrations-Status prüfen
- `GET /api/orders/:id/network-files` - Netzwerk-Dateien auflisten
- `DELETE /api/orders/:id/network-files/:filename` - Netzwerk-Datei löschen

---

## Benutzerverwaltung (Admin)

- `GET /api/users` - Alle Benutzer abrufen
- `POST /api/users` - Benutzer erstellen
- `PUT /api/users/:id` - Benutzer bearbeiten
- `DELETE /api/users/:id` - Benutzer löschen

---

## WebSocket-Events

- `order-created` - Neuer Auftrag erstellt
- `order-updated` - Auftrag aktualisiert
- `order-deleted` - Auftrag gelöscht
