# DownloadAuto Web - Deployment Guide

## Pre-Deployment Checklist

- [ ] Backend API running on correct port (default: 3210)
- [ ] All API endpoints implemented (`/api/status`, `/api/download`, etc.)
- [ ] Environment variables configured (`.env` file)
- [ ] Frontend tested locally (`npm run dev`)
- [ ] Mobile responsiveness verified
- [ ] Dark mode tested
- [ ] Build succeeds (`npm run build`)

## Local Development

```bash
# Install dependencies once
npm install

# Start dev server with HMR
npm run dev

# Opens at http://localhost:5173
# Files auto-reload on save
```

**Environment variables** (`.env`):
```env
VITE_API_URL=http://localhost:3210
VITE_APP_TITLE=DownloadAuto
VITE_APP_VERSION=1.0.0
```

## Production Build

### Step 1: Build Locally

```bash
npm run build
```

This creates `dist/` folder with:
- Minified HTML/CSS/JS
- Asset hashing for cache busting
- Sourcemaps (can be removed if confidential)
- ~40KB gzipped total

### Step 2: Verify Build

```bash
npm run preview
# Opens local preview of production build at http://localhost:4173
```

Test:
- All tabs load correctly
- No console errors
- API calls work (verify VITE_API_URL)
- Responsive design on mobile

## Deployment Options

### Option A: Static File Server (Recommended)

Best for: Small team, internal use

**Deploy to Nginx/Apache:**

```bash
# Build once
npm run build

# Copy dist/ to server
scp -r dist/* user@server:/var/www/downloadauto/
```

**Nginx config** (`/etc/nginx/sites-available/downloadauto`):
```nginx
server {
  listen 80;
  server_name downloadauto.example.com;

  root /var/www/downloadauto;
  index index.html;

  # SPA routing: all requests go to index.html
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Cache busting: versioned assets can be cached forever
  location ~* \.(js|css)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # API proxy to backend
  location /api/ {
    proxy_pass http://localhost:3210/api/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Disable buffering for streaming
    proxy_buffering off;
  }
}
```

Enable and test:
```bash
sudo ln -s /etc/nginx/sites-available/downloadauto /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Option B: Docker Container

Best for: Cloud deployment, auto-scaling

**Dockerfile**:
```dockerfile
# Build stage
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Runtime stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config
RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  location / { \
    try_files $uri $uri/ /index.html; \
  } \
  location ~* \.(js|css)$ { \
    expires 1y; \
    add_header Cache-Control "public, immutable"; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Build & run**:
```bash
docker build -t downloadauto-web .

# Run locally
docker run -p 3000:80 downloadauto-web

# Run with backend connection
docker run \
  -e VITE_API_URL=http://backend:3210 \
  -p 3000:80 \
  downloadauto-web
```

**docker-compose.yml** (with backend):
```yaml
version: '3.8'
services:
  frontend:
    build: ./downloadauto-web
    ports:
      - "3000:80"
    environment:
      VITE_API_URL: http://backend:3210
    depends_on:
      - backend

  backend:
    build: ./downloadauto
    ports:
      - "3210:3210"
    volumes:
      - ./downloads:/app/downloads
```

Run:
```bash
docker-compose up
# Frontend at http://localhost:3000
# Backend at http://localhost:3210
```

### Option C: Cloud Deployment (Vercel/Netlify)

**Vercel** (easiest):

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod

# Or connect GitHub for auto-deploy on push
vercel link
git push origin main  # Auto-deploys to Vercel
```

**Netlify** (similar):

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist

# Or connect GitHub
netlify sites create
git push origin main
```

### Option D: Self-Hosted (Advanced)

**systemd service** (`/etc/systemd/system/downloadauto-web.service`):

```ini
[Unit]
Description=DownloadAuto Web Frontend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/downloadauto-web
ExecStart=/usr/bin/python3 -m http.server 3000 --directory dist
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl enable downloadauto-web
sudo systemctl start downloadauto-web
```

## Environment Configuration

### Development
```env
VITE_API_URL=http://localhost:3210
VITE_APP_TITLE=DownloadAuto Dev
VITE_APP_VERSION=1.0.0-dev
```

### Production
```env
VITE_API_URL=https://api.downloadauto.com
VITE_APP_TITLE=DownloadAuto
VITE_APP_VERSION=1.0.0
```

**Note**: Build-time environment variables in Vite
- Change in `.env` requires `npm run build`
- Then redeploy `dist/` folder

## CORS Configuration

If frontend and backend on different domains:

**Backend** (`Node.js/Express`):
```js
const cors = require('cors');
app.use(cors({
  origin: ['https://downloadauto.example.com', 'http://localhost:5173'],
  credentials: true
}));
```

**Nginx** (alternative):
```nginx
add_header Access-Control-Allow-Origin *;
```

## Performance Optimization

### Caching Strategy

```nginx
# HTML - don't cache (always check)
location /index.html {
  add_header Cache-Control "public, max-age=0, must-revalidate";
}

# JS/CSS with hash - cache forever
location ~* \.(js|css)$ {
  expires 365d;
  add_header Cache-Control "public, immutable";
}

# Images/fonts - cache 1 month
location ~* \.(png|jpg|svg|woff2)$ {
  expires 30d;
  add_header Cache-Control "public";
}
```

### Compression

```nginx
gzip on;
gzip_types text/plain text/css application/javascript application/json;
gzip_min_length 1000;
```

## Monitoring & Logging

### Nginx Access Logs

```bash
# Real-time log tailing
tail -f /var/log/nginx/access.log | grep downloadauto

# Count requests
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn

# Find slow requests
awk '$NF > 1 {print}' /var/log/nginx/access.log
```

### Health Checks

```bash
# Frontend responds
curl http://localhost:3000/

# Backend API available
curl http://localhost:3210/api/status

# Both working
curl -s http://localhost:3000/ | grep -q "DownloadAuto" && echo "OK"
```

## Rollback Procedure

Keep previous builds for quick rollback:

```bash
# Keep versions tagged
npm run build
tar czf releases/build-2026-07-15.tar.gz dist/

# Rollback to previous
tar xzf releases/build-2026-07-14.tar.gz
scp -r dist/* user@server:/var/www/downloadauto/
```

## Troubleshooting

### Build fails: "module not found"

```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Blank page in production

1. Check browser console (F12) for JS errors
2. Check network tab - verify API URLs are correct
3. Check `dist/index.html` exists and is valid
4. Verify web server is serving `dist/` folder

### API calls fail with CORS errors

- Verify `VITE_API_URL` points to correct backend
- Check backend CORS headers
- Try `/api/status` directly in browser

### Styles not loading

- Check `.css` files in `dist/`
- Verify web server gzip encoding works
- Check browser cache (hard refresh: Cmd+Shift+R)

## Monitoring

Recommended tools:
- **Uptime**: UptimeRobot, Statuspage.io
- **Errors**: Sentry, LogRocket
- **Performance**: Lighthouse, Datadog
- **Analytics**: Plausible, GoAccess

## Version Management

**Current**: v15 (React migration)
- ✅ 3-tab layout (Download, Edit, Voice)
- ✅ CapCut-like editor UI
- ✅ Mobile responsive
- ✅ Dark mode
- ✅ API integration ready

**Planned**: v16+
- Video processing UI
- Face detection/smart crop
- Multi-format templates
- Caption/subtitle editor
