# Auftrag als Entwurf duplizieren

## Ziel und Abnahme
Ein berechtigter Benutzer dupliziert einen zugänglichen Auftrag über einen Button in dessen Details. Der Server erzeugt eine neue Auftragsnummer und speichert die Kopie als `Entwurf`. Die Oberfläche öffnet sofort das Bearbeitungsformular. Angaben, Bauteile, Unteraufgaben, Titelbild, Materialangaben und Anhänge werden kopiert. Der vorhandene Notiztext wird um „Dupliziert von Auftrag <Nummer>.“ ergänzt. Eine separate Herkunftsreferenz ermöglicht einen Link zum Original in Details und Bearbeitungsformular; die bestehenden Zugriffsrechte gelten weiterhin.

Die Bearbeitungshistorie und Endabnahme gehören zum Original und werden nicht als Historie des neuen Entwurfs weitergeführt. Gemäß Benutzerentscheidung beginnen tatsächliche Stunden bei null und Unteraufgaben/Bauteile mit Status `pending`. Angaben, geschätzte Stunden, Zuweisungen und Materialangaben bleiben erhalten.

## Schnittstelle und Grenzen
`POST /api/orders/:id/duplicate` akzeptiert optional `{ resetWork: boolean }` und liefert HTTP 201 mit `id`, `orderNumber` und `status: "Entwurf"`. Eine gültige Sitzung ist erforderlich; Auftraggeber dürfen ausschließlich eigene Aufträge kopieren. Andere Benutzer benötigen eine interne Rolle. Der Ersteller findet die Kopie unter Entwürfe, auch wenn der ursprüngliche Auftraggeber beibehalten wird.

Anhänge erhalten neue Identitäten und unabhängige Dateikopien. Auch Bauteil-/Unteraufgabenverweise werden auf neue IDs umgeschrieben. Fehlende oder nicht sicher zuordenbare Dateien führen zu einem Fehler, nicht zu einer unvollständigen Kopie. Fehlgeschlagene Kopien werden bereinigt. Das Original bleibt unverändert.

## Umsetzung und Prüfungen
Serverlogik in `server/utils`, UI-Aktionen und Herkunftslink als gemeinsame Komponenten in `src/components`, Typreferenz in `src/types`. Bestehende Muster (Express/MongoDB, React, Tailwind) ohne neue Abhängigkeiten verwenden. Zuerst Server-Kopie und Dateitests, danach UI und Formularintegration.

Prüfen mit `PATH="$PWD/.pixi/envs/default/bin:$PATH" npx vitest run`, `npm run build` und isolierten Playwright-Tests. Die Tests decken Eigentumsrechte, Dateiunabhängigkeit, Herkunftshinweis, ID-Verweise, Fehlerbereinigung und das Öffnen des neuen Entwurfs ab. Keine echten Benutzer oder Aufträge in Tests verändern.

Beim Speichern oder Einreichen durch Auftraggeber bleiben ausgeblendete Stundenwerte der Unteraufgaben auf dem Server erhalten. Fehlende Stundenfelder gelten nicht als Änderung; ausdrücklich gesendete Stundenkorrekturen unterliegen weiterhin der bestehenden Rechteprüfung. Regressionstests führen dafür die echte PUT-Route mit isolierter Datenbank aus.
