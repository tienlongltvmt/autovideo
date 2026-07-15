#!/bin/bash
# DownloadAuto v15 - Quick Start Script

echo "🚀 DownloadAuto v15 Quick Start"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    npm install
fi

echo ""
echo -e "${BLUE}🎯 DownloadAuto running on:${NC}"
echo "  Frontend: http://localhost:5173"
echo "  Backend: http://localhost:3210"
echo "  Backend API: http://localhost:3210/api/status"
echo ""
echo -e "${BLUE}📝 Commands:${NC}"
echo "  npm run dev      - Start dev server with HMR"
echo "  npm run build    - Build for production"
echo "  npm run preview  - Preview production build"
echo ""
echo -e "${BLUE}✨ Features:${NC}"
echo "  ✅ Download Tab - Queue & manage video downloads"
echo "  ✅ Edit Tab - CapCut-like video editor (3-column)"
echo "  ✅ Voice Tab - AI text-to-speech generation"
echo "  ✅ Real-time Updates - Live job polling"
echo "  ✅ Mobile Responsive - Works on all devices"
echo ""
echo -e "${GREEN}Starting dev server...${NC}"
npm run dev
