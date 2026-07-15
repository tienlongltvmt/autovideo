# DownloadAuto Web - Development Guide

## Getting Started

### First Time Setup

```bash
cd "/Volumes/Works Home/Backend/downloadauto-web"
npm install
cp .env.example .env
npm run dev
```

Opens at `http://localhost:5173` with hot module replacement (HMR).

## Project Structure

```
downloadauto-web/
├── src/
│   ├── components/
│   │   ├── DownloadTab.jsx      # Video download interface
│   │   ├── DownloadTab.css
│   │   ├── EditTab.jsx          # CapCut-style 3-column editor
│   │   ├── EditTab.css
│   │   ├── VoiceTab.jsx         # TTS generation form
│   │   ├── VoiceTab.css
│   │   ├── App.jsx              # Main layout & routing
│   │   └── App.css              # (unused, use index.css)
│   │
│   ├── api/
│   │   └── client.js            # HTTP client wrapper (no deps)
│   │
│   ├── index.css                # Global styles + CSS variables
│   ├── main.jsx                 # React DOM mount point
│   └── index.html               # HTML template
│
├── .env.example                 # Environment variables template
├── vite.config.js               # Vite configuration
├── package.json                 # Dependencies
├── README.md                     # Quick start guide
├── SETUP.md                      # Project architecture
├── DEPLOYMENT.md                # Production deployment
└── DEVELOPMENT.md               # This file

.gitignore files:
- node_modules/                  (install with npm install)
- dist/                          (build output, generated)
- .env                           (secrets, never commit)
```

## Code Style

### Components

Use React Hooks only (no class components):

```jsx
import { useState, useEffect } from 'react'
import { endpoints } from '../api/client'
import './MyComponent.css'

export default function MyComponent() {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const data = await endpoints.myEndpoint()
        setState(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, []) // Add deps if needed

  return (
    <div className="my-component">
      {/* JSX content */}
    </div>
  )
}
```

### Styling

Use CSS with variables:

```css
.my-component {
  background: var(--panel);
  color: var(--text);
  padding: 16px;
  border-radius: 8px;
  box-shadow: var(--shadow);
  transition: all 0.2s;
}

.my-component:hover {
  border: 1px solid var(--accent);
}

@media (max-width: 680px) {
  .my-component {
    padding: 12px;
  }
}
```

**Always test:**
- ✅ Desktop view (>1200px)
- ✅ Tablet view (1000px)
- ✅ Mobile view (<680px)
- ✅ Dark mode (toggle in DevTools)

### API Usage

```jsx
import { endpoints } from '../api/client'

// Call API
const result = await endpoints.download({ url: 'https://...' })

// Handle response
if (result.id) {
  console.log('Success:', result)
} else {
  console.error('Error:', result.error)
}
```

## Development Workflow

### 1. Feature Development

```bash
# Make sure dev server is running
npm run dev

# Edit files in src/
# HMR auto-refreshes the browser

# Open DevTools (F12) to check for errors
```

### 2. Testing Responsive Design

Open DevTools → Device Toolbar (Cmd+Shift+M or Ctrl+Shift+M):
- Test iPhone 12 (390x844)
- Test iPad (768x1024)
- Test desktop (1200+)

### 3. Testing Dark Mode

DevTools → Rendering → Emulate CSS media feature prefers-color-scheme → dark

### 4. Testing Backend Connection

```bash
# Check backend is running
curl http://localhost:3210/api/status

# Check frontend can reach it
curl http://localhost:5173

# In browser console, test API call
fetch('http://localhost:3210/api/status').then(r => r.json()).then(console.log)
```

### 5. Before Committing

```bash
# Run build to catch errors
npm run build

# Check for unused files
npm run preview

# Clear node_modules cache if issues
rm -rf node_modules/.vite
npm install
npm run dev
```

## Common Tasks

### Add a New Component

1. **Create component file** `src/components/MyFeature.jsx`:
```jsx
export default function MyFeature() {
  return <div className="my-feature">Content</div>
}
```

2. **Create styles** `src/components/MyFeature.css`:
```css
.my-feature {
  /* styles */
}
```

3. **Import in App.jsx**:
```jsx
import MyFeature from './components/MyFeature'
```

4. **Add to layout** (in App.jsx JSX):
```jsx
{activeTab === 'myfeature' && <MyFeature />}
```

5. **Add tab button**:
```jsx
<button 
  className={`tab-btn ${activeTab === 'myfeature' ? 'active' : ''}`}
  onClick={() => setActiveTab('myfeature')}
>
  My Feature
</button>
```

### Call a New API Endpoint

1. **Add to client.js**:
```js
export const endpoints = {
  myNewEndpoint: (data) => api.post('/api/my-endpoint', data),
}
```

2. **Use in component**:
```jsx
const result = await endpoints.myNewEndpoint({ foo: 'bar' })
```

### Add Global CSS Variable

1. **Edit src/index.css** in `:root`:
```css
:root {
  --my-color: #123456;
}

@media (prefers-color-scheme: dark) {
  :root {
    --my-color: #654321;
  }
}
```

2. **Use in components**:
```css
.my-element {
  color: var(--my-color);
}
```

### Test on Mobile Device

```bash
# Get local IP
ipconfig getifaddr en0

# Run dev server with network access
npm run dev -- --host 0.0.0.0

# On mobile, open: http://[YOUR_IP]:5173
```

## Performance Tips

### Keep Bundle Small

- ❌ Don't add external UI libraries (Bootstrap, Material-UI)
- ✅ Use CSS Grid/Flexbox
- ✅ Use CSS variables for theming
- ✅ Lazy load components if needed

### Optimize Images

- Convert to WebP
- Use appropriate sizes
- Lazy load: `<img loading="lazy" />`

### Avoid Common Mistakes

- ❌ Don't fetch data in render (causes infinite loops)
- ❌ Don't pass new objects as props (causes re-renders)
- ✅ Use `useCallback` for memoized functions
- ✅ Use `useMemo` for expensive calculations

## Debugging

### Browser DevTools

**Console**:
```js
// Check environment
console.log(import.meta.env.VITE_API_URL)

// Test API
fetch(import.meta.env.VITE_API_URL + '/api/status')
  .then(r => r.json())
  .then(console.log)
```

**Network tab**:
- Check all API calls
- Look for CORS errors (red)
- Check response status codes
- Verify Content-Type headers

**React DevTools extension**:
- Install React DevTools browser extension
- Inspect component props
- Track re-renders
- Profile performance

### Console Logging

```jsx
// Log render
console.log('MyComponent rendered')

// Log state changes
const [count, setCount] = useState(0)
console.log('count changed:', count)

// Log API responses
const result = await endpoints.download()
console.log('download response:', result)
```

### Common Errors

**"Cannot read property 'x' of undefined"**
- Component trying to access data before API loads
- Fix: Add null checks before rendering

**"API call fails with CORS error"**
- Frontend and backend on different origins
- Fix: Check backend CORS headers or use Nginx proxy

**"Styles not applying"**
- CSS variable name wrong
- Selector specificity issue
- File not saved
- Fix: Check DevTools Styles panel

## Useful Commands

```bash
# Development
npm run dev              # Start dev server with HMR

# Building
npm run build            # Create optimized dist/
npm run preview          # Preview production build

# Maintenance
npm install              # Install/update dependencies
npm update               # Update all packages
npm audit                # Check for vulnerabilities
npm audit fix            # Auto-fix security issues
npm list                 # Show installed packages
npm outdated             # Show outdated packages

# Cleanup
rm -rf node_modules      # Remove installed packages
rm -rf .vite             # Clear Vite cache
npm install              # Reinstall from scratch
```

## Documentation

- React Hooks: https://react.dev/reference/react
- Vite: https://vitejs.dev/guide/
- CSS Grid: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout
- CSS Flexbox: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Flexible_Box_Layout

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/add-subtitle-editor

# Make changes
git add .
git commit -m "Add subtitle editor component"

# Push
git push origin feature/add-subtitle-editor

# Create PR on GitHub
```

## Performance Profiling

```bash
# Build and profile
npm run build

# Check bundle size
npm install -g vite-plugin-visualizer
# Add to vite.config.js, then check dist/

# Monitor dev server
npm run dev
# Check DevTools Network tab for load times
```

## Next Steps

1. **Implement backend endpoints** - Ensure all API endpoints return proper JSON
2. **Connect job queue** - Show real-time job updates
3. **Add media upload** - Allow importing local video files
4. **Implement video scrubbing** - Click timeline to seek
5. **Add export options** - Format, quality, codec selection
6. **Implement authentication** - If needed for multi-user

## Support

- Check existing code for examples
- Read component comments
- Check git history for recent changes: `git log --oneline`
- Ask for help in team chat
