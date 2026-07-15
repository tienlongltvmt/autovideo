# DownloadAuto Web Frontend (v15 - React)

Modern React frontend for DownloadAuto, a multi-platform video downloader with built-in editing and AI voiceover generation.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (opens http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Architecture

### 3-Tab Interface

1. **Download Tab** (Tải xuống)
   - Video URL input from TikTok, YouTube, Telegram, etc.
   - Real-time job queue with status badges
   - Error handling and validation

2. **Edit Tab** (Chỉnh sửa)
   - CapCut/Canva-style 3-column layout
   - Left: File browser (160px)
   - Center: Video preview with timeline
   - Right: Properties panel (trim, speed, audio, effects)
   - Fully responsive on mobile (stacks vertically)

3. **Voice Tab** (Giọng nói)
   - AI text-to-speech generation
   - Multiple TTS engines: VieNeu-TTS, Voicebox, OmniVoice
   - Engine-specific voice selection
   - Preview before creating
   - Vietnamese + English + Chinese support

### Technology Stack

- **React 18** - UI framework
- **Vite** - Build tool with instant HMR
- **Axios-free** - Fetch-based HTTP client (zero dependencies)
- **CSS Variables** - Theming system with dark mode
- **No UI libraries** - Pure CSS for small bundle size

## Development

### File Structure

```
src/
├── components/
│   ├── DownloadTab.jsx/css
│   ├── EditTab.jsx/css
│   └── VoiceTab.jsx/css
├── api/
│   └── client.js          # HTTP client wrapper
├── App.jsx                # Main app layout & state
├── index.css              # Global styles + CSS variables
├── main.jsx               # React entry point
└── index.html             # HTML template
```

### Environment Variables

Create `.env` (copy from `.env.example`):

```env
VITE_API_URL=http://localhost:3210
VITE_APP_TITLE=DownloadAuto
VITE_APP_VERSION=1.0.0
```

### Code Organization

**App.jsx** - Main component
- State: `activeTab`, `cobaltStatus`
- Effect: Polls `/api/status` every 15 seconds for backend health
- Renders header with tab buttons and footer

**API Client** (`src/api/client.js`)
```js
// Usage in components
import { endpoints } from '../api/client'

const data = await endpoints.status()
const job = await endpoints.download({ url: 'https://...' })
```

### Adding a New Feature

1. Create component in `src/components/MyFeature.jsx`
2. Create styles in `src/components/MyFeature.css`
3. Import in `src/App.jsx`
4. Use API client: `import { endpoints } from '../api/client'`
5. Add tab button in header if needed

## Styling

### CSS Variables

Available in all components:
```css
--bg                 /* Background color */
--panel              /* Card/panel background */
--accent             /* Primary action color (indigo) */
--accent-light       /* Hover state for accent */
--border             /* Border/divider color */
--text               /* Main text color */
--text-secondary     /* Helper text color */
--shadow             /* Drop shadow */
```

### Dark Mode

Automatically applied via `prefers-color-scheme: dark` preference.

All CSS variables update automatically - no component changes needed.

### Responsive Breakpoints

- **Desktop** (>1400px): Full 3-column editor layout
- **Tablet** (1000-1400px): Optimized 3-column, smaller panels
- **Mobile** (<1000px): Stacked vertically
- **Small mobile** (<680px): Touch-optimized forms

## Backend Integration

Expected API endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/status` | Backend health + Cobalt version |
| POST | `/api/download` | Queue video download job |
| GET | `/api/jobs` | List all jobs (download, TTS, export) |
| GET | `/api/jobs/:id` | Get job details |
| PUT | `/api/jobs/:id` | Update job (e.g., cancel) |
| GET | `/api/media` | List downloaded/processed videos |
| GET | `/api/voice/list` | List available TTS voices (by engine) |
| POST | `/api/voice/create` | Create TTS audio file + queue job |
| POST | `/api/voice/preview` | Preview TTS without saving |

## Performance

- **Bundle size**: ~40KB gzipped (React + Vite)
- **HMR speed**: <100ms file changes
- **First load**: ~1-2s (depends on backend response)

No external CDN - fully self-contained.

## Deployment

### Build for Production

```bash
npm run build
# Creates dist/ folder with optimized build
```

### Deploy to Server

1. Run `npm run build` locally
2. Copy `dist/` contents to your server
3. Configure web server to serve `index.html` for all routes (SPA)
4. Update `VITE_API_URL` in deployment environment

### Docker Example

```dockerfile
FROM node:18 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## Troubleshooting

### Dev server doesn't start
```bash
# Kill existing process on port 5173
lsof -i :5173 | grep node | awk '{print $2}' | xargs kill

npm run dev
```

### Backend not responding
- Check `VITE_API_URL` in `.env` matches backend port
- Verify backend is running: `curl http://localhost:3210/api/status`
- Check browser console for CORS errors

### Styles not updating
- Vite HMR should auto-refresh
- Try hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Check `.css` file for syntax errors

## Contributing

1. Create feature branch: `git checkout -b feature/my-feature`
2. Follow existing code style (React hooks, pure CSS)
3. Test responsive design: Open DevTools and test mobile view
4. Commit with descriptive message
5. Push and create PR

## Notes

- All components use Hooks (useState, useEffect) - no class components
- Avoid external UI libraries - keep bundle size small
- Use CSS Grid/Flexbox for layouts
- Test on mobile view regularly (DevTools)
- Keep API client in sync with backend changes
