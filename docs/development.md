# 🛠️ Entwicklung

## Projekt-Struktur

```
match-werkstatt/
├── server.cjs              # Express Backend-Server
├── simple-ldap-auth.cjs    # LDAP-Authentifizierung
├── src/
│   ├── main.tsx           # React Entry Point
│   ├── App.tsx            # Haupt-Komponente
│   ├── components/        # React-Komponenten
│   ├── context/           # React Context (State Management)
│   ├── types/             # TypeScript-Definitionen
│   └── utils/             # Hilfsfunktionen
├── storage/
│   ├── uploads/           # Lokale Datei-Uploads
│   └── cam-files/         # CAM-Dateien
├── scripts/
│   ├── seedUsers.cjs      # Benutzer-Seeds
│   └── deleteAllOrders.cjs # Aufträge löschen
└── public/                # Statische Assets
```

---

## Lokale Entwicklung

### Backend entwickeln
```bash
# Server mit Auto-Reload (nodemon)
npm install -g nodemon
nodemon server.cjs

# MongoDB-Logs anzeigen
tail -f /var/log/mongodb/mongod.log
```

### Frontend entwickeln
```bash
# Development-Server
npm run dev

# Build für Produktion
npm run build

# Preview Production Build
npm run preview
```

---

## 🤝 Mitwirkung

Beiträge sind willkommen! Bitte beachten Sie:

1. **Fork** das Repository
2. **Feature Branch** erstellen (`git checkout -b feature/NeuesFunktion`)
3. **Commit** mit aussagekräftiger Nachricht (`git commit -m 'feat: Bauteil-Duplikation hinzugefügt'`)
4. **Push** zum Branch (`git push origin feature/NeuesFunktion`)
5. **Pull Request** erstellen

### Code-Style
- TypeScript für Frontend
- ESLint-Regeln beachten
- Kommentare für komplexe Logik
- Keine Konsolenlogs in Production-Code
