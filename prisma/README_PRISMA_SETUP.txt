1. Starte die Datenbank mit Docker Compose:
   docker compose up -d

2. Installiere Prisma und den Client im Projekt:
   npm install prisma @prisma/client

3. Führe die Migration aus, um die Tabellen zu erstellen:
   npx prisma migrate dev --name init

4. Prisma Client kann jetzt im Backend verwendet werden:
   import { PrismaClient } from '@prisma/client';
   const prisma = new PrismaClient();

5. Passe die API-Routen in server.cjs/server.js an, um Aufträge und Dokumente über Prisma zu speichern und abzufragen.

Weitere Infos: https://www.prisma.io/docs/getting-started
