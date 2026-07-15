import { useState, useEffect } from 'react'
import DownloadTab from './components/download/DownloadTab'
import EditTab from './components/edit/EditTab'
import VoiceTab from './components/voice/VoiceTab'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('download')
  const [cobaltStatus, setCobaltStatus] = useState(null)

  useEffect(() => {
    const refreshStatus = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/status`)
        const data = await res.json()
        setCobaltStatus(data)
      } catch (err) {
        console.error('Status fetch error:', err)
      }
    }
    refreshStatus()
    const interval = setInterval(refreshStatus, 15000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>⬇ Download<span>Auto</span></h1>
        </div>
        <nav className="tabs">
          <button
            className={`tab-btn ${activeTab === 'download' ? 'active' : ''}`}
            onClick={() => setActiveTab('download')}
          >
            Tải xuống
          </button>
          <button
            className={`tab-btn ${activeTab === 'edit' ? 'active' : ''}`}
            onClick={() => setActiveTab('edit')}
          >
            Chỉnh sửa
          </button>
          <button
            className={`tab-btn ${activeTab === 'voice' ? 'active' : ''}`}
            onClick={() => setActiveTab('voice')}
          >
            Giọng nói
          </button>
        </nav>
        <div className="badge">
          {cobaltStatus?.cobalt?.cobalt ? (
            <>
              <span className="dot online">●</span>
              <span>cobalt v{cobaltStatus.cobalt.cobalt.version}</span>
            </>
          ) : (
            <>
              <span className="dot">●</span>
              <span>cobalt chưa chạy</span>
            </>
          )}
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'download' && <DownloadTab />}
        {activeTab === 'edit' && <EditTab />}
        {activeTab === 'voice' && <VoiceTab />}
      </main>

      <footer className="app-footer">
        File được lưu vào downloads/ · giao diện <b>v15</b> (React frontend)
      </footer>
    </div>
  )
}

export default App
