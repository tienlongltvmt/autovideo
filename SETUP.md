# DownloadAuto Web - React Frontend Setup

## Project Structure

```
downloadauto-web/
├── src/
│   ├── components/
│   │   ├── DownloadTab.jsx      (Video download UI)
│   │   ├── EditTab.jsx          (CapCut-like video editor)
│   │   └── VoiceTab.jsx         (TTS creation form)
│   ├── App.jsx                  (Main app with 3-tab layout)
│   ├── App.css                  (App styling)
│   ├── index.css                (Global styles)
│   ├── main.jsx                 (React entry point)
│   └── index.html               (HTML template)
├── .env.example                 (Environment config)
├── vite.config.js               (Vite bundler config)
└── package.json                 (Dependencies)
```

## Environment Setup

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Default settings:
- `VITE_API_URL=http://localhost:3210` (Backend API server)
- `VITE_APP_TITLE=DownloadAuto`
- `VITE_APP_VERSION=1.0.0`

## Dependencies

- **React 18+** - UI framework
- **Vite** - Build tool (instant HMR, fast dev server)
- **Axios** - HTTP client for backend communication
- **No UI library** - Pure CSS with CSS variables for theming

## Development

Start dev server:
```bash
npm run dev
```

Opens at `http://localhost:5173` by default.

Build for production:
```bash
npm run build
```

## Architecture

### Communication Flow
```
React Frontend (5173)
    ↓
Axios HTTP API calls
    ↓
Node.js Backend (3210)
    ↓
Job Queue + FFmpeg
```

### Tab Components

1. **DownloadTab** - Download videos from various platforms
2. **EditTab** - 3-column CapCut-like editing interface
3. **VoiceTab** - Generate AI-powered voiceovers (TTS)

### API Endpoints Expected

- `GET /api/status` - Check backend & Cobalt connection
- `POST /api/download` - Queue download job
- `POST /api/jobs` - List/manage jobs
- `GET /api/media` - List downloaded/processed media
- `POST /api/voice/create` - Create TTS audio
- `POST /api/video/export` - Export edited video

## Styling

Pure CSS with CSS variables:
- `--bg` - Background color
- `--panel` - Card/panel color
- `--accent` - Primary action color (#4f46e5)
- `--text` - Main text color
- `--border` - Border color

Automatic dark mode support via `prefers-color-scheme`.

## Next Steps

1. Implement DownloadTab with video URL input form
2. Implement EditTab with 3-column CapCut-like layout
3. Implement VoiceTab with TTS engine selection
4. Create API client module for backend communication
5. Add real-time job status polling
