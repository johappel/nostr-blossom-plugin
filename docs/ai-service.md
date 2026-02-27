# KI-Service (image-describer) – Setup & Konfiguration

Der KI-Service ist ein leichtgewichtiger Node.js-Server (Fastify), der zwei Funktionen bereitstellt:

1. **Bildbeschreibung** (`POST /describe`) – generiert Alt-Text, Genre und Tags für hochgeladene Bilder via Vision-LLM.
2. **Bildgenerierung** (`POST /image-gen`) – erstellt Bilder aus Textprompts via OpenAI-kompatible Image-Gen-API.

Der Service fungiert als **Proxy** zwischen dem Browser-Client und den eigentlichen KI-APIs (OpenRouter, ImageRouter, Ollama, LocalAI etc.). Dadurch bleiben API-Keys serverseitig und werden nie an den Client ausgeliefert.

---

## Inhaltsverzeichnis

- [Schnellstart (lokal mit Docker)](#schnellstart-lokal-mit-docker)
- [Umgebungsvariablen](#umgebungsvariablen)
  - [Allgemein](#allgemein)
  - [Vision / Bildbeschreibung](#vision--bildbeschreibung)
  - [Bildgenerierung](#bildgenerierung)
- [API-Endpunkte](#api-endpunkte)
- [Deployment-Optionen](#deployment-optionen)
  - [Lokal mit Docker Compose](#lokal-mit-docker-compose)
  - [Hinter Nginx (Reverse Proxy)](#hinter-nginx-reverse-proxy)
  - [Hinter Apache2 (Reverse Proxy)](#hinter-apache2-reverse-proxy)
  - [Render.com](#rendercom)
  - [Fly.io](#flyio)
- [KI-Provider konfigurieren](#ki-provider-konfigurieren)
  - [OpenRouter (Vision + Image Gen)](#openrouter-vision--image-gen)
  - [ImageRouter (Image Gen)](#imagerouter-image-gen)
  - [Ollama (lokal, nur Vision)](#ollama-lokal-nur-vision)
- [Sicherheitshinweise](#sicherheitshinweise)
- [Fehlerbehebung](#fehlerbehebung)

---

## Schnellstart (lokal mit Docker)

```bash
# 1. .env anlegen
cp apps/image-describer/.env.example apps/image-describer/.env

# 2. API-Keys eintragen
#    → .env öffnen und OPENROUTER_API_KEY / IMAGE_GEN_API_KEY setzen

# 3. Container bauen und starten
docker-compose up --build -d

# 4. Prüfen
curl http://localhost:8787/health
# → {"ok":true}
```

---

## Umgebungsvariablen

### Allgemein

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `PORT` | `8787` | Port, auf dem der Server lauscht |

### Vision / Bildbeschreibung

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `OPENROUTER_API_KEY` | *(leer)* | API-Key für den Vision-Provider (Pflicht für `/describe`) |
| `OPENROUTER_VISION_MODEL` | `qwen/qwen3-vl-8b-instruct` | Vision-Modell für Bildbeschreibung |
| `OPENROUTER_RESPONSE_LANGUAGE` | `German` | Sprache der generierten Beschreibungen |
| `OPENROUTER_TIMEOUT_MS` | `15000` | Timeout für den Vision-API-Call |
| `OPENROUTER_IMAGE_FETCH_TIMEOUT_MS` | `12000` | Timeout zum Herunterladen des Quellbilds |
| `OPENROUTER_IMAGE_MAX_BYTES` | `4000000` | Max. Bildgröße in Bytes (vor Komprimierung) |
| `OPENROUTER_IMAGE_MAX_DIM` | `1280` | Max. Bilddimension (Pixel), darüber wird skaliert |
| `OPENROUTER_IMAGE_QUALITY` | `78` | JPEG-Qualität für die komprimierte Vorschau |
| `OPENROUTER_IMAGE_MIN_DIM` | `512` | Min. Dimension – darunter wird hochskaliert |
| `OPENROUTER_IMAGE_MIN_QUALITY` | `40` | Min. Qualität für iterative Komprimierung |
| `OPENROUTER_PDF_MAX_PAGES` | `4` | Max. Seitenanzahl bei PDF-Verarbeitung |
| `OPENROUTER_PDF_TEXT_MAX_CHARS` | `4500` | Max. extrahierte Textzeichen aus PDFs |
| `OPENROUTER_VISION_INLINE_ONLY` | `false` | Wenn `true`, wird das Bild immer inline (base64) gesendet, nie per URL |

### Bildgenerierung

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `IMAGE_GEN_API_URL` | `https://api.imagerouter.io/v1/openai` | Base-URL der Image-Gen-API |
| `IMAGE_GEN_API_KEY` | *(leer)* | API-Key (optional bei Ollama) |
| `IMAGE_GEN_MODEL` | `black-forest-labs/FLUX-2-klein-4b:free` | Modellname für Bildgenerierung |
| `IMAGE_GEN_TIMEOUT_MS` | `60000` | Timeout in ms (Generierung dauert meist 10-40s) |
| `IMAGE_GEN_DEFAULT_SIZE` | `1024x1024` | Standard-Bildgröße |

> **Hinweis:** Vision und Image Gen nutzen bewusst getrennte Konfigurationen, da unterschiedliche Provider/Modelle verwendet werden können.

---

## API-Endpunkte

### `GET /health`

Health-Check. Gibt `{"ok": true}` zurück.

### `POST /describe`

Generiert eine Bildbeschreibung.

```json
// Request
{ "imageUrl": "https://example.com/photo.jpg" }

// Response (Erfolg)
{
  "description": "Ein Sonnenuntergang über den Bergen...",
  "alt": "Sonnenuntergang über Bergen",
  "genre": "landscape",
  "tags": ["sunset", "mountains", "nature"],
  "inputMode": "inline"
}
```

### `POST /image-gen`

Generiert ein Bild aus einem Textprompt.

```json
// Request
{ "prompt": "A cat riding a bicycle through Paris" }

// Response (Erfolg)
{ "image": "data:image/png;base64,iVBORw0KGgo..." }

// Response (Fehler)
{ "error": "Image generation timed out after 60000ms" }
```

---

## Deployment-Optionen

### Lokal mit Docker Compose

Die einfachste Variante für Entwicklung und persönliche Nutzung.

```bash
docker-compose up --build -d
```

Der Service ist dann unter `http://localhost:8787` erreichbar. Im Widget wird als `visionEndpoint` der Wert `http://localhost:8787` konfiguriert.

### Hinter Nginx (Reverse Proxy)

Für Produktivbetrieb wird empfohlen, den Service hinter einem Reverse Proxy zu betreiben – für TLS, Rate-Limiting und Zugriffskontrolle.

```nginx
# /etc/nginx/sites-available/ai-service
server {
    listen 443 ssl http2;
    server_name ai.example.com;

    ssl_certificate     /etc/letsencrypt/live/ai.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai.example.com/privkey.pem;

    # Rate-Limiting (wichtig! Schützt API-Keys vor Missbrauch)
    limit_req_zone $binary_remote_addr zone=ai:10m rate=5r/s;

    location / {
        limit_req zone=ai burst=10 nodelay;

        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Image Gen kann lange dauern
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;

        # CORS wird vom Fastify-Server selbst gehandhabt
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ai-service /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Im Widget dann `visionEndpoint: "https://ai.example.com"` setzen.

### Hinter Apache2 (Reverse Proxy)

```apache
# /etc/apache2/sites-available/ai-service.conf
<VirtualHost *:443>
    ServerName ai.example.com

    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/ai.example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/ai.example.com/privkey.pem

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:8787/
    ProxyPassReverse / http://127.0.0.1:8787/

    # Timeout für Bildgenerierung
    ProxyTimeout 120

    # Optional: Zugriff einschränken
    # <Location />
    #     Require ip 192.168.1.0/24
    # </Location>
</VirtualHost>
```

```bash
sudo a2enmod proxy proxy_http ssl
sudo a2ensite ai-service
sudo systemctl reload apache2
```

### Render.com

Render bietet einfaches Docker-Deployment mit automatischem TLS.

1. **Neuen Web Service erstellen** → Docker-Umgebung wählen
2. **Root Directory**: `apps/image-describer`
3. **Dockerfile Path**: `Dockerfile`
4. **Environment Variables** aus `.env.example` übertragen:
   - `PORT` = `8787` (oder Render default `10000`)
   - `OPENROUTER_API_KEY` = dein Key
   - `IMAGE_GEN_API_URL` = `https://api.imagerouter.io/v1/openai`
   - `IMAGE_GEN_API_KEY` = dein ImageRouter Key
   - `IMAGE_GEN_MODEL` = `black-forest-labs/FLUX-2-klein-4b:free`
5. **Health Check Path**: `/health`
6. **Plan**: Free Tier reicht für persönliche Nutzung (512 MB RAM)

> **Achtung:** Render Free Tier spinnt den Container nach 15 Min. Inaktivität herunter. Erster Request dauert dann ~30s (Cold Start). Für zuverlässigere Verfügbarkeit den Starter-Plan nutzen.

Nach dem Deploy wird die URL z.B. `https://ai-service-xxxx.onrender.com`. Im Widget:

```typescript
visionEndpoint: "https://ai-service-xxxx.onrender.com"
```


---

## KI-Provider konfigurieren

### OpenRouter (Vision + Image Gen)

[openrouter.ai](https://openrouter.ai) – Aggregator für viele LLM/Vision-Modelle. Ein API-Key für beides.

```dotenv
# Vision (Bildbeschreibung)
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_VISION_MODEL=qwen/qwen3-vl-8b-instruct

# Bildgenerierung (OpenRouter nutzt chat/completions + modalities)
IMAGE_GEN_API_URL=https://openrouter.ai/api/v1
IMAGE_GEN_API_KEY=sk-or-v1-...
IMAGE_GEN_MODEL=black-forest-labs/flux.2-klein-4b
```

> **Hinweis:** OpenRouter nutzt für Bildgenerierung ein eigenes Format (`/chat/completions` mit `modalities: ['image']`). Der Server erkennt OpenRouter-URLs automatisch und verwendet das korrekte Format.

### ImageRouter (Image Gen)

[imagerouter.io](https://imagerouter.io) – Spezialisierter Provider für Bildgenerierung. Bietet Free-Tier-Modelle. Verwendet das Standard-OpenAI-Format (`/images/generations`).

```dotenv
IMAGE_GEN_API_URL=https://api.imagerouter.io/v1/openai
IMAGE_GEN_API_KEY=ir-...
IMAGE_GEN_MODEL=black-forest-labs/FLUX-2-klein-4b:free
```

Verfügbare Modelle: [imagerouter.io/models](https://imagerouter.io/models)

### Ollama (lokal, nur Vision)

Für lokale Vision ohne API-Key. Bildgenerierung über Ollama ist auf Apple Silicon (MLX) beschränkt.

```dotenv
# Im Docker-Container: host.docker.internal statt localhost
OPENROUTER_API_KEY=ollama
OPENROUTER_VISION_MODEL=llava:13b

# Falls Ollama nicht im selben Docker-Netzwerk läuft:
# IMAGE_GEN_API_URL=http://host.docker.internal:11434/v1
```

> **Wichtig:** `localhost` im Docker-Container zeigt auf den Container selbst. Für den Host-Rechner `host.docker.internal` (Docker Desktop) oder die Host-IP verwenden.

### Kombination: OpenRouter (Vision) + ImageRouter (Image Gen)

Empfohlenes Setup – nutzt den besten Provider für jede Aufgabe:

```dotenv
# Vision via OpenRouter
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_VISION_MODEL=qwen/qwen3-vl-8b-instruct

# Image Gen via ImageRouter
IMAGE_GEN_API_URL=https://api.imagerouter.io/v1/openai
IMAGE_GEN_API_KEY=ir-...
IMAGE_GEN_MODEL=black-forest-labs/FLUX-2-klein-4b:free
```

---

## Sicherheitshinweise

| Thema | Empfehlung |
|-------|------------|
| **API-Keys** | Nur in `.env` speichern, nie committen. `.env` ist in `.gitignore`. |
| **CORS** | Der Server erlaubt standardmäßig alle Origins. Für Produktion in `server.ts` einschränken. |
| **Rate-Limiting** | Nicht im Server eingebaut! Unbedingt per Reverse Proxy (Nginx/Apache) begrenzen. |
| **TLS** | Der Server spricht kein HTTPS. TLS immer über Reverse Proxy oder PaaS (Render/Fly) terminieren. |
| **Zugriffskontrolle** | Ohne Auth kann jeder, der die URL kennt, deine API-Keys nutzen. Für öffentliches Deployment Auth-Middleware oder IP-Whitelist hinzufügen. |
| **Docker** | Container läuft als `node`-User (non-root). Keine Secrets im Image. |

### Minimale Auth-Absicherung (optional)

Da der Service keine eingebaute Auth hat, kann man schnell per Nginx einen shared Secret erzwingen:

```nginx
location / {
    # Client muss Header "X-AI-Token: mein-geheimes-token" senden
    if ($http_x_ai_token != "mein-geheimes-token") {
        return 403;
    }
    proxy_pass http://127.0.0.1:8787;
}
```

Im Widget wird dann der `visionEndpoint` mit Custom-Headers konfiguriert.

---

## Fehlerbehebung

### Container startet nicht

```bash
docker-compose logs image-describer
```

Häufige Ursachen:
- `.env`-Datei fehlt oder falsch formatiert
- Port 8787 bereits belegt → `PORT` ändern

### "fetch failed" bei Image Gen

- **Ursache:** `IMAGE_GEN_API_URL` zeigt auf `localhost` innerhalb des Containers.
- **Lösung:** `http://host.docker.internal:PORT` verwenden (Docker Desktop) oder den tatsächlichen Hostnamen.

### "Provider returned error"

- API-Key ungültig oder Guthaben aufgebraucht
- Modell beim Provider nicht verfügbar
- Logs prüfen: `docker-compose logs -f image-describer`

### Vision gibt nur Fallback-Text zurück

- `OPENROUTER_API_KEY` nicht gesetzt → Server gibt `warning`-Feld in der Response zurück
- Bild-URL nicht öffentlich erreichbar → `OPENROUTER_VISION_INLINE_ONLY=true` setzen (sendet Bild als Base64)

### Timeout bei Bildgenerierung

- Bildgenerierung dauert typisch 10–40 Sekunden
- `IMAGE_GEN_TIMEOUT_MS` ggf. auf `120000` erhöhen
- Reverse Proxy Timeout muss mindestens genauso hoch sein (`proxy_read_timeout` in Nginx)

### Cors-Fehler im Browser

- Prüfen ob der Service läuft und erreichbar ist
- Fastify CORS ist standardmäßig für alle Origins konfiguriert
- Reverse Proxy darf keine eigenen CORS-Header setzen (doppelte Header → Fehler)
