# Karteikarten

Statische Lern-App für Vorlesungs-Karteikarten (DHBW). Kein Build-Schritt: Vercel liefert die Dateien direkt aus.

- **Lernen:** Karte umdrehen, mit „Nochmal“ oder „Gewusst“ bewerten; nicht gewusste Karten kommen wieder.
- **Alle Karten:** Liste mit Volltextsuche zum Nachschlagen.
- **Filter** nach Themen/Vorlesungsteilen, Fortschritt pro Stapel im Browser (localStorage).
- **Formeln** mit KaTeX: `$...$` inline, `$$...$$` abgesetzt.
- **PWA:** lässt sich auf dem Handy zum Startbildschirm hinzufügen und funktioniert danach offline.

## Neue Vorlesung hinzufügen

1. Datei `decks/<id>.json` anlegen:

```json
{
  "id": "krypto",
  "title": "Kryptographie",
  "topics": [
    { "id": "vl1", "label": "VL1 Grundlagen", "color": "#8a6d1f" }
  ],
  "cards": [
    { "topic": "vl1", "q": "Frage …", "a": "<p>Antwort mit <b>HTML</b> und $\\LaTeX$.</p>" }
  ]
}
```

2. Eintrag in `decks/index.json` ergänzen (`id`, `file`, `title`, `subtitle`, `color`).
3. Committen und pushen – Vercel deployt automatisch.

Der Fortschritt hängt an einer Prüfsumme der Frage: Wird eine Frage umformuliert, gilt die Karte wieder als neu.

`tools/funk-src.js` ist die Quelle des Funk-Stapels (dort lassen sich LaTeX-Formeln bequemer schreiben): `node tools/funk-src.js` erzeugt `decks/funk.json`.

## Lokal starten

```bash
npx serve .
```
