# Blossom Media Widget — FAQ für Anfänger

Willkommen! 👋 Dieses Dokument erklärt das Nostr-basierte Blossom Media Widget in nicht-technischen Begriffen. Wenn Sie sich fragen "Was ist Nostr?" oder "Wie unterscheidet sich das von WordPress?" — Sie sind hier richtig.

---

## 1️⃣ Was ist Nostr? (Basics)

### Was ist Nostr in 25 Worten?

**Nostr** = "Notes and Other Stuff Transmitted by Relays"

Ein **dezentrales Netzwerk**, in dem jeder Nutzer seine Daten mit seinem privaten Schlüssel signiert und überall publishen kann — ohne zentrale Kontrolle.

Stellen Sie sich vor: **Twitter, aber jeder User hostet eine Kopie der Timeline-Daten lokal.** Statt dass Twitter.com alles entscheidet, entscheiden anonyme "Relay"-Server, wessen Posts sie speichern.

### Nostr vs. Social Media — Tabelle

| Aspekt | Twitter / Instagram | Nostr |
|--------|---|---|
| **Wer kontrolliert die Daten?** | Das Unternehmen | Sie (über Ihren privaten Key) |
| **Passwort-Risiko** | Ja (Admin könnte es lesen) | Nein (Sie unterzeichnen lokal mit Key) |
| **Kann zensiert werden?** | Ja, Account gesperrt → Vorbei | Nein, Events auf Relays sind immutable |
| **Mehrere Accounts?** | Müssen Sie auf jeder Plattform erstellen | Ein Key, überall nutzbar |
| **Server ausfallen?** | Seite down → nichts zu sehen | Andere Relays haben Kopien → sichtbar |
| **Daten exportieren?** | "LOL nein" | Jederzeit, alle Events sind Ihre |

### Warum ist Nostr dezentralisiert?

**Zentral (YouTube):**
```
Videos → YouTube-Server (1 Stelle) → nur wenn YouTube online und will → nur wenn 1000 Views
```

**Dezentral (Nostr):**
```
Events → Relay A, B, C, D, ... (beliebig viele!)
→ jeder Relay kann offline sein, andere haben Kopie
→ niemand kann "Featured/4K/Privat/Versteckt" entscheiden außer dem Autor
→ Nutzer wählt welche Relays er liest
```

**Praktisches Beispiel:**
- **YouTube:** "Das Video entspricht nicht unseren Guidelines" → gelöscht für alle
- **Nostr:** "Relay A mag das Event nicht" → aber Relay B, C, D haben es noch → Nutzer sieht es trotzdem

### Wie funktioniert dezentralisiert in der Praxis? (Szenario)

**Szenario: Ihr Lieblingsrelay geht offline**

1. Sie publishen: "Hallo, ich habe ein Bild hochgeladen! 📸"
   - Das Event wird zu Relay 1, 2, 3, 4, 5 gesendet
   - Jedes Relay speichert: "Diese Person publishte: [Event]"
   
2. **Relay 2 geht offline.**
   - Ihre Nachricht ist noch auf Relay 1, 3, 4, 5
   - Nutzer, die Relay 2 lesen: kurzzeitig blind
   - Sie: kein Problem, andere Relays haben Ihre Nachricht

3. **Relay 2 geht wieder online.**
   - Andere Relays synchronisieren: "Hey, wir haben neue Events für [user]"
   - Im Handumdrehen hat Relay 2 die Nachricht wieder

**Fazit:** Kein Single Point of Failure. Ausfälle sind Sekundenangelegenheit, nicht permanent wie bei Zentralservern.

---

## 2️⃣ Blossom & Dateispeicherung

### Was ist Blossom?

**Blossom** = ein Standard für **dezentrales Datei-Hosting** (ähnlich S3, aber offen).

Blossom-Server speichern:
- Bilder, PDFs, Videos, etc.
- "Wem gehört das?" (via Nostr-Signatur)
- "Wann wurde hochgeladen?"
- "Metadaten: Lizenz, Alt-Text, Autor?"

**Das Wichtigste:** Blossom ≠ Nostr
- **Blossom** = Wo die Dateien physisch liegen (Server mit HTTP API)
- **Nostr** = Wer uploaded hat + Beschreibung (Metadaten-Events)

**Analogie:** 
- Nostr-Relay = „Adressbuch" (wem gehört was?)
- Blossom-Server = „Lagerhaus" (wo ist die Datei?)

### Blossom vs. S3 / Google Drive / WordPress Media

| Aspekt | S3 / Google Drive | WordPress Media | Blossom |
|--------|---|---|---|
| **Wer hostet?** | Amazon / Google | Ihr Server | Wen Sie wollen |
| **Mehrere Server?** | Nein (ein Bucket) | Nein (ein WordPress) | **Ja! Sie wählen mehrere** |
| **Metadaten wo?** | In AWS-Tags oder Datenbank | In WP-Datenbank | In Nostr-Events (global) |
| **Zugang nach Account-Löschung?** | Daten weg | Daten weg | Daten noch auf Servern + Relay |
| **Portabil?** | Müssen S3 verlassen | Müssen WordPress verlassen | Ein Key überall, Daten übertragbar |
| **API Standard?** | AWS-spezifisch | WP REST API | HTTP BUD-02/BUD-04 Standard |
| **Kosten** | Per Gigabyte | Included in Hosting | Kostenlos oder Pay-what-you-want |

### Warum mehrere Blossom-Server? (Redundanz-Szenario)

```
Sie laden Ihre Katzen-Fotos hoch zu:
  → Server 1 (primal.net) — 20ms schnell
  → Server 2 (nostr.build) — 300ms
  → Server 3 (mein-eigener-server.com) — offline

Widget wählt: Primal.net (schnellste)
→ Sie bekommen URL: https://cdn.primal.net/abc123.jpg

Falls primal.net später abstürzt?
→ Nostr.build hat eine Kopie → Funktioniert immer noch!

Falls auch nostr.build down?
→ Ihr eigener Server hat die Datei → Sie betreiben Distributor selbst
```

**Praktischer Vorteil:** Sie sind nicht von EINEM Server abhängig.

### Wie funktioniert der Upload praktisch?

```
Sie: Drücke auf "🌸 Mediathek" Button
    ↓
Widget fragt: "Welche Datei?"
    ↓
Sie: Wählen IMG_1234.jpg
    ↓
Widget: Sende zu [Server 1, Server 2, Server 3] parallel
    ↓
Server 1: ✅ Datei erhalten! Hier die URL: https://cdn.example/abc.jpg
Server 2: (noch nicht fertig)
Server 3: (noch nicht fertig)
    ↓
Widget: "Erste Server fertig! Speichere diese URL."
    ↓
URL wird in das Eingabefeld geschrieben: https://cdn.example/abc.jpg
    ↓
Sie: "Fertig! Kann ich noch Metadaten hinzufügen?"
```

Das alles dauert < 5 Sekunden normalerweise.

---

## 3️⃣ Das Widget verstehen

### Was macht das Blossom Media Widget?

Das Widget ist ein **einbettbarer Dialog** (wie das WordPress Media Picker Fenster) mit 4 Hauptfunktionen:

1. **Upload-Tab** — Datei hochladen zu Blossom-Servern
2. **Galerie-Tab** — Alle Ihre bisherigen Uploads anschauen
3. **Bildgenerierung-Tab** — Text → Bild (KI, optional)
4. **Weitere Tabs** — Community-Bilder, OER-Ressourcen (optional)

### Vier Tabs erklärt

#### 📤 Upload-Tab
```
1. Datei auswählen (Image, PDF, etc.)
2. Widget uploaded zu mehreren Blossom-Servern parallel
3. Metadaten eingeben (optional):
   - Beschreibung
   - Alt-Text (für Accessibility)
   - Autor
   - Lizenz (CC-BY, CC-0, etc.)
4. Speichern → Event wird zu Nostr-Relay publisht
5. URL ins Eingabefeld geschrieben
```

#### 🖼️ Galerie-Tab
```
Zeigt:
  - Alle Ihre bisherigen Uploads (sortiert nach Datum)
  - Thumbnail-Vorschau
  - Filter nach Schlagworten
  - "Cloud-Badge" für Cloud-only Files (nicht lokal)

Klick: Detail-View öffnet
  - Vollständige Metadaten
  - Download, Löschen, Share-Buttons
  - KI-Vorschlag für fehlende Alt-Texte
```

#### 🎨 Bildgenerierung-Tab
```
(Optional — nur wenn KI-Service konfiguriert)

Sie geben ein: "Eine Katze auf einem Fahrrad"
↓
KI generiert: Bild-Datei
↓
Widget: "Möchten Sie speichern und als NIP-94 publishen?"
```

#### 🌍 Community-Tab
```
(Optional — nur wenn Community-Plugin installiert)

Zeigt: Öffentliche Bilder anderer Nostr-Nutzer
Suche: Nach Schlagworten, Autor, Lizenz
Download: Bilder mit korrekter Attribution
```

### Wo landen meine Dateien? (Flowchart)

```
Sie: Klick Upload-Button
    ↓
    ┌─────────────────────────────────┐
    │ Datei auswählen + Metadaten      │
    └─────────────────────────────────┘
            ↓
       [BLOSSOM UPLOAD]
       ↙  ↓  ↘
   Server1 Server2 Server3
    (Primal.net, Nostr.build, etc.)
       ↙  ↓  ↘
    URL + Tags ← Zuerst fertig gewinnt
           ↓
      ┌──────────────────┐
      │ NIP-94 Event baut    │
      │ ["url", "..."]   │
      │ ["alt", "..."]   │
      │ ["t", "tag"]     │
      └──────────────────┘
            ↓
      [PUBLISH TO RELAY]
      (z.B. wss://relay.damus.io)
            ↓
    ┌─────────────────────────────────┐
    │ Relay speichert: Diese Person    │
    │ publishte Datei mit diesen Tags  │
    └─────────────────────────────────┘
            ↓
      ✅ Event für alle Relays verfügbar
      ✅ URL ins Eingabefeld geschrieben
      ✅ Datei auf Server(n) verfügbar
```

### Sind meine Daten sicher?

ℹ️ **Ja, aber mit Einschränkungen:**

| Sicherheits-Aspekt | Was ist sicher? |
|---|---|
| **Upload-Authentifizierung** | ✅ Nur Sie können als "Sie" publishen (Nostr-Signatur) |
| **Datei-Integrität** | ✅ SHA-256 Hash verhindert Datei-Manipulation |
| **Privatsphäre: Wer sieht meine Uploads?** | ⚠️ Events sind öffentlich (Relay veröffentlicht) — **nutzen Sie private Keys nich lokal** |
| **Datenverlust** | ✅ Multi-Server + Relay-Replikation = Redundanz |
| **Datenschutz vor Admin** | ✅ Blossom-Admin sieht nur Datei, nicht "wem gehört" (Relay sagt das) |
| **EXIF-Daten in Fotos?** | ⚠️ Widget entfernt nicht automatisch → Sie sollten vor Upload löschen |

⚠️ **Wichtig:** Events sind **öffentlich**. Wenn Sie ein private Foto publishen, sieht es wer im Relay-Verzeichnis liegt!

---

## 4️⃣ Signer & Authentifizierung (WICHTIG!)

Dies ist das Herzstück des Systems. **Ein "Signer" ist Ihre digitale Geldbörse für Unterschriften.**

### Was ist ein "Signer"? (Geldbörse-Metapher)

**Analogie: Unterschrift statt Passwort**

```
WordPress:
  Sie: "Ich bin ich, hier mein Passwort: abc123"
  WordPress: "OK, ich glaube dir (oder auch nicht)"

Nostr:
  Sie: "Ich bin ich, hier meine mathematische Unterschrift"
  Jeder: "Wow, nur die Person mit privater-key-xyz kann
          diese Unterschrift machen. Das ist wirklich sie!"
```

**Ein Signer ist ein Tool, das diese Unterschriften macht, ohne dass Sie den privaten Schlüssel lokal speichern müssen.**

**Metapher: Signer = digitale Geldbörse**
- Sie haben einen privaten Schlüssel (wie Kredit-PIN)
- Der Signer ist wie ein Geldautomat: Sie sagen "unterschreibe das", der Geldautomat macht es, aber Sie sehen die PIN nicht

### NIP-07 erklärt: Browser-Wallet

**NIP-07** = Browser-Extension für Nostr-Signing

**Wie es funktioniert:**
```
1. Sie installieren Alby / nos2x / andere Extension
2. Extension speichert Ihren privaten Schlüssel (lokal, verschlüsselt)
3. Sie browsen zu einer Seite mit Blossom Widget
4. Widget fragt: "Darf ich unterschreiben, dass du das publishen willst?"
5. Extension zeigt Popup: "Seite möchte unterschreiben — Erlauben? [Ja/Nein]"
6. Sie klicken [Ja]
7. Extension unterschreibt lokal (privater Schlüssel verlässt niemals die Extension)
8. Widget bekommt signierte Nachricht → publisht

👍 Sicher: Privater Schlüssel nie auf Webseite
❌ Nachteil: Extension muss installiert sein
```

**Beliebte Extensions:**
- **Alby** (https://getalby.com) — komplette Wallet + Nostr
- **nos2x** (https://chromewebstore.google.com/detail/nos2x) — nur Nostr
- **Amber** (Android-App für Telefon)

🔧 **So installieren Sie einen NIP-07 Signer:**
1. Gehen Sie zu https://getalby.com (oder nos2x Link oben)
2. Klicken Sie "Install Extension"
3. Browser-Dialog: Extension hinzufügen? → [Akzeptieren]
4. Extension Icon erscheint in Browser-Toolbar
5. Klick auf Icon → "Create new key" oder "Import existing"
6. Key erstellt/importiert → fertig!

### NIP-46 erklärt: Remote Signer (nsec.app, Bunker)

**NIP-46** = Signer-Protokoll für Remote Services

**Wie es funktioniert:**
```
1. Sie gehen auf nsec.app (oder nsecBunker, etc.)
2. Dort erstellen/importieren Sie Ihren Nostr-Key
3. nsec.app gibt Ihnen einen Link: bunker://...?secret=...
4. Sie kopieren diesen Link
5. In Widget: Settings → "Bunker URL einfügen" → Link einfügen
6. Widget fragt: "Darf ich Requests zum Remote-Signer senden?"
7. Remote Service verarbeitet Requests: "Unterschreibe das"
8. Remote Service antwortet: "Unterschrieben ✓"
9. Widget publct

👍 Sehr sicher: Privater Schlüssel ist nie auf Ihrem Rechner!
👍 Portable: Von überall einsetzbar (Telefon, Computer, etc.)
❌ Nachteil: Benötigt aktive Remote-Service
```

**Beliebte Remote Signer:**
- **nsec.app** (https://nsec.app) — schnell, kostenlos
- **nsecBunker** (https://app.nsecbunker.com) — self-hosted möglich
- **Amber Bunker** (Android)

🔧 **So nutzen Sie einen NIP-46 Signer:**
1. Gehen Sie zu https://nsec.app
2. Klicken Sie "Generate new key" (oder "Import existing")
3. Key wird bei nsec.app gespeichert/verwaltet
4. nsec.app zeigt Ihnen: `bunker://npub1xxx...?relay=...&secret=...`
5. Diese URL kopieren
6. Im Widget: Settings → "NIP-46 Bunker URI" → Link einfügen
7. Widget fragt: "Mit Remote-Signer verbinden? [Ja]"
8. Fertig! Sie können jetzt uploaden.

### Welcher Signer ist besser? (Trade-offs)

| Kriterium | NIP-07 Extension | NIP-46 Remote |
|---|---|---|
| **Komfort** | ⭐⭐⭐ (immer bereit) | ⭐⭐ (Link kopieren) |
| **Sicherheit** | ⭐⭐⭐⭐ (lokal, Extension kontrolliert) | ⭐⭐⭐⭐⭐ (Remote kontrolliert Schlüssel!) |
| **Portable** | ⚠️ Pro Gerät eine Extension | ✅ Von überall nutzbar |
| **Brauchst du...** | Browser-Extension installiert | Nur Copy-Paste |
| **Wenn Device gestohlen?** | Passwort + Extension-PIN schützen | Remote-Signer hat Kontrolle |
| **Beste für...** | Regelmäßige Nutzer am selben PC | Power-User, Mobilgeräte, Premium-Sicherheit |

### Warum direkt `nsec` eingeben nicht möglich im MVP?

⚠️ **Das Widget unterstützt NICHT, dass Sie einen privaten Schlüssel (`nsec1...`) direkt eingeben!**

**Gründe:**
1. **Sicherheit:** Privater Schlüssel im Browser = 🚨 Sicherheitskatastrope
   - Seite gehackt? Hacker hat Ihr `nsec` → alle Mittel weg
   - Phishing? Falsche Seite? `nsec` gestohlen.
   
2. **Best Practice:** Nur Wallets/Signers sollten private Keys sehen
   - Alby sagt: "Nein, wir speichern nsec nicht im Widget"
   - nsec.app sagt: "Nein, der Browser sieht das nicht"
   - Das ist Sicherheits-Standard für Kryptos

3. **Zukunft:** Später könnte es eine sichere Local-Storage-Variante geben
   - Mit Verschlüsselung + Passwort-Schutz
   - Aber immer noch riskanter als Extension/Remote

**Also:** Nutzen Sie entweder Alby (Extension) oder nsec.app (Remote). Das ist sicher by Design. ✅

### Signer einrichten — Step-by-Step Anleitung

#### Option A: NIP-07 mit Alby (einfachste Variante)

```
🔧 Schritt 1: Alby installieren
   → FolgSie https://getalby.com
   → Klicken Sie "Install for [Browser]"
   → Browser-Dialog: [Add Extension]
   → Fertig!

🔧 Schritt 2: Nostr-Key erstellen
   → Extension-Icon in Toolbar klicken
   → "Create new key" wählen
   → Passwort setzen (min. 10 Zeichen!)
   → [Create] klicken
   → **Backup-Seed aufschreiben!** (Zettel, nicht digital)

🔧 Schritt 3: Widget testen
   → Eine Seite mit Blossom Widget öffnen
   → [🌸 Mediathek] Button klicken
   → Extension-Popup fragt: "Diese Seite möchte unterschreiben — OK? [Allow]"
   → Sie erlauben
   → Widget funktioniert!

✅ Fertig!
```

#### Option B: NIP-46 mit nsec.app (sicherste Variante)

```
🔧 Schritt 1: nsec.app besuchen
   → Gehen Sie auf https://nsec.app
   → Klicken Sie "Generate new key" (oder "Import")
   → nsec.app zeigt: "Backup your recovery code?" — SCREENSHOT machen oder auf Papier schreiben!

🔧 Schritt 2: Bunker-URI kopieren
   → nsec.app zeigt Ihnen die URI: bunker://npub1...?relay=...&secret=...
   → Diese URI kopieren (in Clipboard)

🔧 Schritt 3: URL ins Widget einfügen
   → Blossom Widget öffnen
   → Settings / 👤 Icon klicken
   → „NIP-46 Bunker" Tab
   → Feld: "Bunker URI einfügen"
   → Paste (Strg+V / Cmd+V)
   → [Connect] oder Auto-Connect
   → Widget fragt: "Mit Remote verbinden? [Allow]"
   → Fertig!

✅ Sie können jetzt überall von diesem Link aus uploaden!
```

---

## 5️⃣ Metadaten & Lizenzen

### Warum Metadaten wichtig?

```
Metadaten = "Daten über die Daten"

Beispiel Foto:
  Datei: IMG_1234.jpg
  Metadaten:
    - Beschreibung: "Katze schläft auf Tastatur"
    - Alt-Text: "Gray tabby cat sleeping on laptop keyboard"
    - Autor: "Max Mustermann"
    - Datum: 2026-03-01
    - Lizenz: CC-BY-4.0
```

**Wozu ist das wichtig?**

1. **Accessibility:** Screen-Reader liest Alt-Text vor → Blinde Nutzer sehen das Bild
2. **SEO:** Google indexiert Beschreibung → Bild wird in Bildersuche gefunden
3. **Urheber:** "Wem gehört das?" → Rechtliche Klarheit, nicht "Ich vergesse es später"
4. **Lizenz:** "Darf jemand das verwenden?" → CC-BY heißt "Ja, mit Namensnennung"
5. **Tagables:** "Schlagworte" → andere finden Ihr Bild bei Suche nach "Katze"

### NIP-94 vereinfacht: Was sind die Tags?

**NIP-94** = Metadaten-Standard für Dateien (in Nostr Events)

Beispiel-Event nach Upload:

```json
{
  "kind": 1063,  // = "Das ist eine Datei-Beschreibung"
  "tags": [
    ["url", "https://blossom.primal.net/abc123.jpg"],
    ["m", "image/jpeg"],                              // MIME-Typ
    ["x", "abc123def456..."],                         // SHA-256 Hash
    ["alt", "Katze schläft auf Tastatur"],           // Alt-Text
    ["summary", "Eine süße Katze, die schläft..."],  // Beschreibung
    ["author", "Max Mustermann"],                     // Autor
    ["t", "cat"],                                     // Schlagwort 1
    ["t", "sleeping"],                                // Schlagwort 2
    ["license", "https://creativecommons.org/licenses/by/4.0/", "CC-BY-4.0"]
  ]
}
```

Das ist was "hinter den Kulissen" passiert wenn Sie Metadaten eingeben.

### Lizenzmanagement: CC-BY, CC0, PDM, etc. erklärt

| Lizenz | Was bedeutet das? | Darf ich verwenden? |
|---|---|---|
| **CC-BY-4.0** | Creative Commons Namensnennung | ✅ Ja, mit Namensnennung des Authors |
| **CC-BY-SA-4.0** | CC namensnennung + Weitergabe unter gleicher Lizenz | ✅ Ja, aber muss auch CC-BY-SA sein |
| **CC0-1.0** | Public Domain / Verzicht auf alle Rechte | ✅ Ja, völlig frei |
| **PDM** (Public Domain Mark) | Werk ist gemeinfrei | ✅ Ja, völlig frei |
| **CC-BY-NC** | Namensnennung + NICHT kommerziell | ⚠️ Nur privat, nicht für Geld |
| **Proprietär** | "Nur der Author darf es verwenden" | ❌ Nein, nicht ohne Erlaubnis |

**Praktisch für Ihr Projekt:**

Wenn Sie **Ihre eigenen Fotos** hochladen:
- **Wollen Sie, dass andere sie frei verwenden?** → Wählen Sie **CC-BY-4.0** (mit Namensnennung) oder **CC0** (völlig frei)
- **Wollen Sie sie nur selbst verwenden?** → Wählen Sie **Proprietär** oder beschreiben Sie in der Lizenz

Wenn Sie **Fotos anderer** verwenden:
- Prüfen Sie die Lizenz des Origins!
- CC-BY → Namensnennung in Alt-Text oder Bildunterschrift hinzufügen
- Proprietär → Schreiben Sie dem Author

### Mein Bild als CC-BY publishen — wie geht das?

```
🔧 Schritt 1: Upload starten
   → [🌸 Mediathek] klicken
   → Upload-Tab wählen
   → Datei auswählen

🔧 Schritt 2: Metadaten eingeben
   → Beschreibung: "Katze schläft auf Tastatur"
   → Alt-Text: "Gray tabby cat sleeping on keyboard"
   → Autor: "Max Mustermann"  (oder Ihr Name)

🔧 Schritt 3: Lizenz wählen
   → Lizenz-Dropdown: "CC-BY-4.0" wählen
   → ℹ️ Das heißt: Andere dürfen verwenden, müssen aber nennen

🔧 Schritt 4: Publishen
   → [Speichern / Publish] klicken
   → Widget: "Event wird zu Relay publisht..."
   → Event published!

✅ Ihr Foto ist jetzt:
   - Für alle lesbar
   - Mit Metadaten versehen
   - Unter CC-BY-4.0 Lizenz
   - Auf andere übertragbar
```

---

## 6️⃣ Galerie & Galerie-Abruf

### Woher kommen die Dateien in der Galerie?

```
Galerie-Quellen (in dieser Reihenfolge):
1. Ihre lokalen Uploads (von diesem Gerät)
2. Ihre Relay-Uploads (alle bisherigen Events, überall publisht)
```

**Was ist der Unterschied?**

```
Lokal:
  → Datei wurde von DIESEM Browser hochgeladen
  → Widget sieht Datei in eigenem Cache
  → Schnell, immer verfügbar

Vom Relay:
  → Datei wurde VON ÜBERALL hochgeladen (anderes Gerät? Anderer Widget?)
  → Widget fragt Relay: "Zeig mir alle Events dieser Person mit kind:1063"
  → Relay antwortet: [Event1, Event2, Event3, ...]
  → Widget zeigt die an
  → Wenn Relay offline: kann kurzzeitig weg sein
```

### NIP-94 Events — was ist das?

Sie wissen schon, dass Metadaten in Nostr-Events landen. Hier die Details:

```
Ihr Computer: "Ich will einen Upload publishen mit folgenden Metadaten..."
               ↓
           (Create NIP-94 Event)
               ↓
          kind = 1063
          tags = [url, alt, author, license, ...]
               ↓
           (Sign mit Signer)
               ↓
          Signierte Nachricht
               ↓
         (Send to Relay)
               ↓
         Relay speichert: "Person mit pubkey XYZ hat Event mit kind 1063 publisht"
               ↓
         Andere Nutzer können abfrage: "Zeig mir alle kind:1063 Events von Person XYZ"
         Relay: Hier sind [Event1, Event2, Event3, ...]
```

### Relays erklärt: was sind Relays?

**Relays** = Nostr-Server, die Events speichern und austauschen

**Analogie: Relays sind wie Pinnwände im Dorf**

```
Dorf-Szenario:
  
  Es gibt 3 Pinnwände (= 3 Relays):
  - Marktplatz-Pinnwand (wss://relay.damus.io)
  - Kirchen-Pinnwand (wss://relay.primal.net)
  - Gemeindehalle-Pinnwand (wss://mein-eigenes-relay.de)
  
  Max publisht: "Foto von meiner Katze!"
  Max: "Ich hänge das an alle 3 Pinnwände"
    → Marktplatz: Zettel gehängt
    → Kirche: Zettel gehängt
    → Gemeindehalle: Zettel gehängt
  
  Später:
  Anna fragt: "Zeig mir alles von Max!"
  - Anna schaue Marktplatz-Pinnwand: "Yo, hier sind Maxs Zettel!"
  - Marktplatz ist offline: Anna überprüft Kirche-Pinnwand: "Auch hier!"
```

**Praktisch für Sie:**

```
Widget-Konfiguration:
  relayUrl: ["wss://relay.damus.io", "wss://relay.primal.net", "wss://mein-relay.de"]
              ↓
Widget: "Ich werde alle 3 Relays fragen nach Deinen Events"
  ↓
Relay1 antwortet sofort: [Event1, Event2]
Relay2 antwortet langsam: [Event2, Event3, Event4]
Relay3 offline: (Timeout)
  ↓
Widget: "Kombiniere alle Antworten" → zeige [Event1, Event2, Event3, Event4]
```

### Was wenn 3 Relays konfiguriert sind? (Parallel-Abruf)

```
Sie: [🌸 Mediathek] öffnen → Galerie-Tab klicken

Widget: "OK, hole alle deine Uploads von Relays"

Widget macht parallel:
  Relay1: "Gib mir alle kind:1063 Events von [pubkey]"
  Relay2: "Gib mir alle kind:1063 Events von [pubkey]"
  Relay3: "Gib mir alle kind:1063 Events von [pubkey]"
  
Warten auf Antworten (Max 2-10 Sekunden):
  Relay1: ✅ 5 Events gefunden
  Relay2: ✅ 8 Events gefunden (neu synchronisiert!)
  Relay3: 💤 Offline / Timeout

Widget: Kombiniere [5] + [8] + [] = 8 Events insgesamt
        (Duplikate bereinigt nach SHA-256)

        "8 Deine hochgeladenen Dateien:"
```

**Praktischer Vorteil:**
```
Szenario: Sie laden gestern von Laptop hoch (zu Relay1)
          Heute nutzen Sie Telefon und möchten Galerie sehen

Ohne Multi-Relay: "Moment, das Relay von gestern ist offline..." → Leer!
Mit Multi-Relay: "Moment, sag Relay2..." → "Ah ja, hier sind Deine Uploads!"
```

### Alte Uploads in der Galerie? (Immutable Events)

ℹ️ **Ja!** Events sind **unveränderlich**.

```
2026-03-01: Sie uploaden Foto A mit Alt-Text "Katze"
            → Event E1 mit Alt:"Katze" an Relay publisht
            → Relay speichert EWI für immer

2026-03-15: Sie sagen "Moment, das soll 'Kätzchen' sein"
            → Sie publishen NEUES Event E2 mit Alt:"Kätzchen"
            → E1 ist immer noch da!

Galerie zeigt:
  → Event E2 (neueste Version)
  → Event E1 (alte Version)

Edit vs. Delete:
  - Edit: Neues Event publishen (E2)
  - Delete: Einen "Delete Request" publishen (Art Markierung)
```

---

## 7️⃣ KI-Features (Optional aber mächtig)

### Image Describer Service — was ist das?

Ein **eigenständiger Web-Service**, der:
1. **Bilder analysiert** (Vision-LLM) → Alt-Text, Genre, Tags
2. **Bilder generiert** (Text-to-Image) → aus Prompt ein Bild machen

**Das Widget fragt:** "Darf ich einen KI-Service nutzen?"

Sie antworten: "Ja, hier ist die URL: http://localhost:8787" oder "https://ai.example.com"

### Vision-LLM: Automatische Alt-Texte (Beispiel)

```
Sie uploaden: IMG_1234.jpg
Bild zeigt: Eine rote Scheuern auf grüner Wiese

Sie klicken: [KI-Vorschlag] im Metadaten-Formular

Widget sendet zu KI-Service:
  { imageUrl: "https://blossom.primal.net/IMG_1234.jpg" }

KI-Service antwortet:
  {
    description: "Eine rote Scheune steht..." ,
    alt: "Red barn on green meadow with blue sky",
    genre: "landscape_photography",
    tags: ["barn", "rural", "nature", "red", "landscape"]
  }

Widget: "KI-Vorschlag:"
        Alt: "Red barn on green meadow with blue sky"  ✏️ (editierbar)
        Genre: "landscape_photography"                 ✏️
        Tags: ["barn", "rural", "nature"]              ✏️
        [Übernehmen] [Ablehnen] [Manuell ändern]
```

### Image Generation: Text → Bild (Beispiel)

```
Sie geben ein: "Eine Katze auf einem Fahrrad, Kunstmalerei"

Widget fragt: "Bild generieren? [Ja]"

Dies ist langsam: 15-60 Sekunden!

KI generiert Bild...

Widget zeigt: Generiertes Bild
             [Speichern als NIP-94?] [Nochmal versuchen] [Ablehnen]

Sie: [Speichern]

Widget: Uploaded das Bild zu Blossom
        Event publisht mit hint: "ai-image-generated"
```

### Wo läuft der KI-Service? (Local Docker vs. Remote API)

**Optionen:**

```
Option 1: Lokal
  Sie: docker run image-describer
  Port: 8787
  URL für Widget: http://localhost:8787
  Vorteile: Offline verfügbar, schnell, private Daten
  Nachteile: Sie zahlen Kosten, müssen Server betreiben

Option 2: Öffentlicher Service Host
  Sie: Deployen zu Render.com oder Fly.io
  URL: https://ai-service-abc123.onrender.com
  Vorteile: Immer online, Scale automatisch
  Nachteile: Kosten, Datenschutz
```

### Kosten & API-Keys (OpenRouter, ImageRouter)

Die KI-Service **braucht externe APIs** für Vision + Image Gen.

**Vision (Bildbeschreibung):**
```
Provider: OpenRouter (https://openrouter.ai)
Modell: qwen/qwen3-vl-8b-instruct (kann Bilder sehen)
Kosten: ~$0.01-0.05 pro Bild (abhängig von Bildgröße)
API-Key: https://openrouter.ai → get API key → in .env
```

**Image Generation:**
```
Provider: ImageRouter (https://imagerouter.io)
Modell: FLUX-2-klein (kostenlos, aber langsam)
Kosten: Free Tier oder $0.10-0.50 pro Bild (bezahlte Modelle)
API-Key: https://imagerouter.io → get API key → in .env
```

ℹ️ **Wichtig:** Sie brauchen **nicht beide**. Sie können:
- Nur Vision nutzen (Bildbeschreibung ohne Image Gen)
- Nur Image Gen nutzen (Bildgenerierung ohne Vision)
- Beide kombinieren (empfohlen)

---

## 8️⃣ Praktische Unterschiede zu WordPress/CMS

### Tabellenvergleich: Blossom vs. WordPress Media vs. Drupal

| Vergleich | WordPress | Drupal Assets | Blossom |
|-----------|-----------|---|---|
| **Hosting** | Ein Server (Ihr Hoster) | Ein Server (Ihr Hoster) | Beliebig viele Blossom-Server |
| **Kosten/Speicher** | Included in Hosting | Included in Hosting | Kostenlos oder Pay-what-you-want |
| **Authentifizierung** | WordPress-Passwort | Drupal-Passwort | Nostr-Signatur (Signer) |
| **Datentralisierung** | Zentral | Zentral | **Dezentral** |
| **Admin-Kontrolle** | Wordpress-Admin kontrolliert alles | Drupal-Admin kontrollt alles | **Sie kontrollieren mit privat key** |
| **Export/Download** | ZIP-Export möglich | XML-Export möglich | **Event-Export immer möglich** |
| **Datenverlust bei Shutdown** | Alles weg | Alles weg | **Auf Relays + anderen Servern repliziert** |
| **Mehrere Medien-Orte** | Nein (ein WordPress) | Nein (ein Drupal) | **Ja, mehrere Blossom-Server** |
| **Lizenzmanagement** | Benutzerdefiniertes Feld | Benutzerdefiniertes Feld | **Standardisiert NIP-94** |
| **Portabilität** | Muss nach neuem WordPress kopieren | Muss nach neuem Drupal kopieren | **Ein Signer, überall nutzbar** |

### Portabilität: Kann ich meine Daten mitnehmen?

**WordPress:**
```
Sie: "Ich möchte weg von dem Hoster!"

Option 1 — Zu neuer WordPress:
  1. WP Dashboard → Tools → Export
  2. XML-Datei sichern
  3. Zu neuem Hoster
  4. Neue WordPress installieren
  5. WP Dashboard → Tools → Import
  6. XML importieren
  7. Bilder? 😭 Müssen separat kopiert werden!
  
  Zeita: 3-5 Stunden, tech. Kenntnis nötig
```

**Blossom:**
```
Sie: "Ich möchte zu anderem Relay/Server!"

1. Sie haben Ihren Signer noch (Alby, nsec.app, etc.)
2. Sie öffnen Blossom-Widget auf neuer Seite
3. Sie nutzen DENSELBEN Signer
4. Alle Ihre Events sind ÜBERALL noch vorhanden
5. Sie publishen zu anderen Relays
6. Alle Ihre Dateien sind noch auf anderen Servern

Zeit: Sekunden, null tech. Kenntnis nötig!
```

###Vendor Lock-in: Bin ich von einem Server abhängig?

**WordPress:**
```
Sie: "Was if wordpress.com mir den Account sperrt?"

Szenario: wordpress.com Account gesperrt (Grund egal)
  → Seite down
  → Datei Zugriff: ???
  → Abhängig von Administrator ("Bitte geben Sie mir meine Daten")

Die Macht liegt bei wordpress.com
```

**Blossom:**
```
Sie: "Was wenn eine Blossom-Server mich blockt?"

Szenario: Server A blockiert Sie
  → Ihre Events sind noch auf Server B, C, D... (wenn Sie dort auch uploadet haben)
  → Sie uploaden künftig zu andern Server
  → KEIN BLOCKADE FÜR KÜNFTIGE EVENTS

Die Macht liegt bei Ihnen (Sie wählen Server!)
```

### Privatsphäre: Wer sieht meine Uploads?

**WordPress:**
```
Datei privat vs. öffentlich:
  Privat: "Nur registrierte Nutzer sehen"
  Öffentlich: "Jeder sieht"

Aber: Hoster sieht ALLES (Server-Admin-Zugriff)
      Google Analytics "Seite mit Bild" trackt Nutzer
      WordPress-Admin kann Datei manuell sperren

Die Macht liegt bei Admin/Hoster
```

**Blossom:**
```
Events sind IMMER öffentlich im Relay
  → "Diese Person publishte diese Datei mit diesen Tags"

Button: Aber:
  → Datei-Inhalte sind NICHT verschlüsselt (Blossom kennt die URL)
  → Sie sollten private Fotos NICHT publishen
  → Sensible Bilder: Lokal lagern, nicht auf Relays

Power-User: Können später verschlüsselte Relays nutzen!
```

### Redundanz: Was wenn Blossom Server down ist?

**WordPress:**
```
Szenario: Hoster-Datacenter abbrennt!

Option 1: Sie hatten lokal Backup → Disaster Recovery
Option 2: Sie hatten Backup-Service (Extra!) → 1-2 Tage Recovery
Option 3: Sie hatten nichts → 💀 Datenverlust

Die Verantwortung liegt bei Ihnen (müssen selbst backen)
```

**Blossom:**
```
Sie uploadet zu: Server A und Server B
Sie publishen zu: Relay A, B, C, D, E

Szenario: Server A brennt ab
  → URL weg
  → Aber: Server B hat noch Kopie
  → Widget: nutzt Server B-URL stattdessen
  → Funktioniert trotzdem!

Szenario: Relay A, B ausfallen
  → Events weg
  → Aber: Relay C hat Backup (wurde repliziert)
  → Widget fragt Relay C
  → Funktioniert trotzdem!

Redundanz ist eingebaut!
```

---

## 9️⃣ Einbettung & Integration

### Wo kann ich das Widget nutzen?

Das Widget kann **überall** eingefügt werden, wo Sie HTML/JS kontrollieren:

```
✅ Blogpost (WordPress, Ghost, Custom CMS)
✅ Landing Page (Webflow, Wix, etc.)
✅ Web App (React, Vue, Svelte)
✅ TipTap Editor (für Blogs, Wikis)
✅ Bookmarklet (für jede Webseite!)
✅ Static HTML (Notepad schreib)
```

### Drei Einbettungs-Wege erklärt

#### Way 1️⃣: Auto-Init (NULL JavaScript nötig!)

Beste für: HTML ohne Build-System

```html
<!-- Datei: index.html -->

<!-- Input-Feld, das den Upload-Button bekommt -->
<input type="text" data-blossom name="imageUrl" />

<!-- Widget-Script einfach einbinden -->
<script
  src="https://cdn.example.com/blossom-media.iife.js"
  data-blossom-config='{
    "servers": ["https://blossom.primal.net"],
    "relayUrl": "wss://relay.damus.io"
  }'
></script>

<!-- Ready! Das input bekommt automatisch einen [🌸 Mediathek] Button -->
```

#### Way 2️⃣: Manuelles Init (für Callbacks)

Beste für: Wenn Sie Ihre Logik nach Upload ausführen möchten

```html
<script src="https://cdn.example.com/blossom-media.iife.js"></script>

<input type="text" name="imageUrl" />
<button onclick="openMediaWidget()">Open Mediathek</button>

<script>
  const media = window.BlossomMedia.init({
    servers: ['https://blossom.primal.net'],
    relayUrl: 'wss://relay.damus.io',
    onInsert: (result, targetElement) => {
      console.log('URL inserted:', result.url);
      //  Machen Sie was Sie möchten!
      document.querySelector('#preview').src = result.url;
    }
  });

  function openMediaWidget() {
    media.open(document.querySelector('input[name=imageUrl]'));
  }
</script>
```

#### Way 3️⃣: ESM Import (moderne Build-Systeme)

Beste für: Vite, Webpack, React, Vue, Svelte Apps

```ts
import { init } from '@blossom/plugin/widget';

const media = init({
  servers: ['https://blossom.primal.net'],
  relayUrl: 'wss://relay.damus.io',
  onInsert: (result) => {
    console.log('URL:', result.url);
  }
});

// Später: programmatisch öffnen
document.querySelector('#btn').addEventListener('click', () => {
  media.open(document.querySelector('input[name=url]'));
});
```

### Welches Format für welchen Ort? (URL, Markdown, HTML, Nostr-Tag)

Nach Upload können Sie das Ausgabeformat wählen:

| Format | Ausgabe-Beispiel | Beste für |
|--------|---|---|
| **URL** (default) | `https://blossom.primal.net/abc.jpg` | Eingabefelder, JSON APIs |
| **Markdown** | `![Alt](https://...)` | Markdown-Editor (Ghost, Obsidian) |
| **HTML** | `<img src="..." alt="...">` | HTML-Editor, WYSIWYG |
| **Nostr-Tag** | `["imeta", "url ...", "alt ..."]` | Nostr-Events, komplexe Tags |
| **JSON** | `{ "url": "...", "alt": "...", "tags": [...] }` | APIs, programmatisch |

🔧 **Im Widget: Wo stellen Sie das Format ein?**

```html
<!-- Auto-Init: Format per data-attribute -->
<textarea data-blossom data-format="markdown"></textarea>

<!-- Manuell: Format in Settings oder nach onInsert -->
<!-- Das Widget zeigt ggf. ein Format-Menü -->
```

### Bookmarklet vs. HTML-Snippet (Use Cases)

#### HTML-Snippet (Empfohlen für Websites)

```html
<!-- Sie kennen HTML, können Code einfügen -->
<input type="text" data-blossom />
<script src="...blossom-media.iife.js"></script>

✅ Aufwand: Minimal
✅ Performance: Schnell (Script wird inline geladen)
❌ Limit: Musste Website selbst betreuen
```

#### Bookmarklet (Für fremde Websiten)

```javascript
// URL eines Bookmarklets:
javascript:(function(){
  const script=document.createElement('script');
  script.src='https://example.com/blossom-media.iife.js';
  script.setAttribute('data-blossom-config', '{"servers":["https://blossom.primal.net"]}');
  document.head.appendChild(script);
})();
```

Save als Bookmark im Browser.
Klick auf jeder Webseite → Blossom öffnet sich!

✅ Aufwand: 0 (keine Website-Änderung nötig)
✅ Sicherheit: Kontrolliertes Script-Loading
❌ Limit: Funktioniert nicht überall (Blog-Kommentare, etc.)

---

## 🔟 Häufige Fehler & Troubleshooting

### "Mein Signer funktioniert nicht" — Checkliste

```
❓ Probleme: Widget fragt nach Signer, antwortet aber nicht

Checkliste:
☐ Extension installiert?
  Alby/nos2x: Browser-Extension Icon rechts oben → sichtbar?
  nsec.app: Bunker-URL korrekt kopiert?

☐ Key erstellt?
  → Alby: Klick Extension → "Create new key" getan?
  → nsec.app: Key created und Backup gesichert?

☐ Richtige Webseite?
  → Alby/nos2x: Webseite fragt "Erlauben Sie zu unterschreiben?"
     → Müssen Sie [Allow] klicken!

☐ Mehrere Tabs offen?
  → Alby kann verwirrt sein → schließen Sie Tabs, 1 offen halten

Wenn immer noch nicht:
  → Browser Console öffnen (F12)
  → Suchen nach Fehler-Nachricht
  → Screenshot + Nachricht zu Community/Support

```

### "Galerie ist leer" — Warum?

```
❓ Problem: Widget zeigt 0 Dateien in Galerie-Tab

Mögliche Gründe:

🔴 Noch nie etwas hochgeladen
   → Logisch! Galerie zeigt nur Ihre Uploads
   → Lösung: [Upload-Tab] nutzen, etwas hochladen

🔴 Relay nicht konfiguriert
   → Widget-Config hat kein relayUrl?
   → Lösung: relayUrl: "wss://relay.damus.io" hinzufügen

🔴 Falschter Signer
   → Sie haben mit Alby hochgeladen, nutzen jetzt nsec.app?
   → Jeder Signer hat andere pubkey!
   → Lösung: Immer gleichen Signer nutzen

🔴 Relay offline
   → Relay temporär down
   → Lösung: Warten, oder anderes Relay in Config hinzufügen

🔴 Sehr lange Wartezeit
   → Relay antwortet langsam (Netzwerk)
   → Lösung: Geduld, oder 5-10s warten

Schnell-Check:
  → Browser-Console (F12)
  → Suchen: "nip94Events" oder "Relay query"
  → Sehen Sie Fehler?
```

### "Upload hängt fest" — Was ist los?

```
❓ Problem: Klick [Upload], Datei wählen, dann... nichts?

Mögliche Gründe:

🔴 Datei zu groß
   → Manche Blossom-Server akzeptieren nur bis 100MB
   → Lösung: Kleinere Datei wählen, oder komprimieren

🔴 Falscher Dateityp
   → Server akzeptiert nur Bilder, Sie uploaden EXE?
   → Lösung: Image/PDF wählen

🔴 Signer-Dialog nicht gesehen?
   → Extension zeigt "[Allow] zum Unterschreiben"
   → Sie haben übersehen?
   → Lösung: Alby/nos2x Icon oben rechts suchen, dort klicken

🔴 Netzwerk-Fehler
   → WiFi weg? Offline?
   → Lösung: Internet-Verbindung prüfen

🔴 Server nicht erreichbar
   → Blossom-Server selbst down
   → Lösung: Anderer Server in Config, oder später versuchen

Browser-Console (F12) → Fehler suchen:
  "Failed to fetch" → Netzwerk-Problem
  "No signer" → Signer nicht bereit
  "413 Payload Too Large" → Datei zu groß
```

### "KI-Vorschlag funktioniert nicht" — Lösungen

```
❓ Problem: [KI-Vorschlag] Button greyed out oder Fehler

Mögliche Gründe:

🔴 KI-Service nicht konfiguriert
   → Config hat kein visionEndpoint?
   → Lösung: visionEndpoint: "http://localhost:8787" hinzufügen

🔴 KI-Service läuft nicht
   → URL ist falsch oder Service offline
   → Lösung: docker-compose up -d image-describer
               oder Service-URL prüfen

🔴 API-Key nicht gesetzt
   → Service braucht OPENROUTER_API_KEY
   → Lösung: .env bearbeiten, API-Key hinzufügen, Service neustarten

🔴 Bild kann nicht erreicht werden
   → Blossom-URL nicht öffentlich
   → Lösung: Bild muss einen öffentlichen Link haben

🔴 CORS Fehler
   → Browser sagt "Cross-Origin blocked"
   → Lösung: Service hinter Reverse Proxy (Nginx), oder CORS aktivieren

Quick-Fix:
  → Browser-Console (F12)
  → Tab "Network"
  → [KI-Vorschlag] klicken
  → Suchen nach /describe Request
  → Sehen Sie 200 OK oder Fehler?
  → Wenn Fehler: Response-Body lesen
```

---

## 💡 Tipps & Tricks

### Signer verwalten — Best Practices

```
✅ DO:
  → Install Alby oder nos2x einmal
  → Backup-Seed aufschreiben (Papier!)
  → Diesen Signer überall nutzen
  → Passwort für Extension stark machen

❌ DON'T:
  → Niemals nsec in Browser eingeben!
  → Multiple nsec pro Gerät (verwirrend)
  → Seed digital ins Notizbuch speichern
  → Passwort einfach
  → Seed mit anderen teilen
```

### Mehrere Geräte — wie synchronisieren?

```
Szenario: Laptop + Telefon + Tablet

Best Practice:
  1. Erstellen Sie einen NIP-46 Remote Signer (nsec.app)
  2. Alle Geräte nutzen DENSELBEN Bunker-URI
  3. Überall: Einfach Link in Widget einfügen → ready!

Warum Remote besser?
  → Keine Seed auf jedem Gerät speichern müssen
  → Zentrale Verwaltung bei Remote Service
  → Wenn Device gestohlen: nur dieser Device kompromittiert
```

### Metadaten nicht vergessen!

```
Gute Praxis:
  ✅ Upload → [Metadaten einfügen]
     → Alt-Text (Screen Reader!)
     → Beschreibung (Kontext)
     → Lizenz (Rechtssicherheit)
     → Tags (Auffindbarkeit)

So brauchen Sie später nicht nochmal bearbeitet (theoretisch möglich, aber kompliziert)
```

### Performance-Tipps

```
Für schnellere Uploads:

1. Mehrere Blossom-Server nehmen (Parallel)
   servers: ["primal", "nostr.build", "damus.io"]

2. Nähere Relays nehmen (geografisch)
   relayUrl: "wss://relay.eu" statt "wss://relay.us"

3. WiFi statt Mobil (wenn möglich)

4. Große Bilder komprimieren vor Upload
   (Widget macht auch Kompression, aber kleiner = schneller)
```

---

## 📚 Weitere Ressourcen

| Ressource | Link | Für |
|-----------|------|-----|
| **Alby Wallet** | https://getalby.com | NIP-07 Browser Extension |
| **nos2x** | https://i.imgur.com/n95ERP0.png (Chrome Store) | Alternative NIP-07 |
| **nsec.app** | https://nsec.app | NIP-46 Remote Signer |
| **Nostr Markdown** | https://nostr-protocol.org | Nostr Spezifikation |
| **Blossom Spec** | https://github.com/hzrd149/blossom | BUD Details |
| **NIP-94** | https://github.com/nostr-protocol/nips/blob/master/94.md | Datei-Metadaten Standard |
| **Blossom Plugin Repo** | https://github.com/.../blossom-plugin | Source Code |
| **Community Forum** | https://nostr.community | Fragen stellen |

---

## ❓ Original-Fragen (für Quick-Jump)

Nutzen Sie `Ctrl+F` zum Suchen:

- Warum dezentralisiert? → Abschnitt 1️⃣
- Was ist ein Signer? → Abschnitt 4️⃣
- Wie funktioniert Upload? → Abschnitt 3️⃣
- Metadaten vergessen? → Abschnitt 5️⃣
- Galerie leer? → Abschnitt 10️⃣
- KI-Service? → Abschnitt 7️⃣
- WordPress Vergleich? → Abschnitt 8️⃣

---

## 🎯 Nächste Schritte (nach Lesen dieses FAQs)

1. **Signer wählen + installieren** (5 Min)
   - Alby (einfach) oder nsec.app (sicherer)

2. **Ein Widget irgendwo probieren** (5 Min)
   - `examples/simple-input.html` im Browser öffnen

3. **Kleine Datei hochladen** (2 Min)
   - Mit Metadaten
   - Lizenz setzen
   
4. **Galerie anschauen** (1 Min)
   - Sollte Ihren Upload zeigen
   
5. **Auf fremder Seite probieren** (5 Min)
   - Mit Bookmarklet oder eingebauten Widget

6. **Community fragen**, wenn Fragen! 💬

---

**Last Updated:** März 2026  
**Feedback?** Diese Dokumentation soll für Sie verständlich sein! Wenn Fragen offen bleiben → Issue schreiben!
