# 🚢 Deployment

Neben der empfohlenen Installation über Docker (siehe [Installation](installation.md)) gibt es auch andere Möglichkeiten, die Match-Werkstatt in Produktion zu deployen.

---

## Produktions-Deployment (Manuell)

### Mit PM2 (empfohlen)
```bash
# PM2 installieren
npm install -g pm2

# Anwendung starten
pm2 start server.cjs --name "match-werkstatt"

# Auto-Start nach Reboot
pm2 startup
pm2 save

# Logs anzeigen
pm2 logs match-werkstatt

# Status prüfen
pm2 status
```

### Systemd Service (Linux)
```bash
# Service-Datei erstellen: /etc/systemd/system/match-werkstatt.service
[Unit]
Description=Match Werkstatt Server
After=network.target mongodb.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/match-werkstatt
ExecStart=/usr/bin/node server.cjs
Restart=always

[Install]
WantedBy=multi-user.target

# Service aktivieren
sudo systemctl enable match-werkstatt
sudo systemctl start match-werkstatt
```

### Reverse Proxy (nginx)
```nginx
server {
    listen 80;
    server_name werkstatt.example.com;

    # Frontend (statische Dateien)
    location / {
        root /opt/match-werkstatt/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```
