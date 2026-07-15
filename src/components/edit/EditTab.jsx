import { useState, useEffect, useRef } from 'react'
import { api } from '../../api/client'
import { Button } from '../shared'
import '../EditTab.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3210'

export default function EditTab() {
  const [media, setMedia] = useState([])
  const [selectedMedia, setSelectedMedia] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [trimStart, setTrimStart] = useState('00:00')
  const [trimEnd, setTrimEnd] = useState('00:00')
  const [speed, setSpeed] = useState(1)
  const [audio, setAudio] = useState('original')
  const [exporting, setExporting] = useState(false)
  const videoRef = useRef(null)

  useEffect(() => {
    const fetchMedia = async () => {
      setLoading(true)
      try {
        const result = await api.get('/api/files')
        const files = (result.files || []).map(file => ({
          id: file.name,
          name: file.name,
          url: `${API_URL}/files/${encodeURIComponent(file.name)}`,
          size: file.size,
          duration: '--:--',
        }))
        setMedia(files)
      } catch (err) {
        setError('Không thể tải danh sách video: ' + err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchMedia()
    const interval = setInterval(fetchMedia, 10000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const parseTime = (timeStr) => {
    const [mins, secs] = timeStr.split(':').map(Number)
    return (mins || 0) * 60 + (secs || 0)
  }

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleVideoTimeUpdate = (e) => {
    setCurrentTime(e.target.currentTime)
  }

  const handleVideoLoadedMetadata = (e) => {
    setDuration(e.target.duration)
    setTrimEnd(formatTime(e.target.duration))
  }

  const handleTimelineClick = (e) => {
    if (videoRef.current && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect()
      const percent = (e.clientX - rect.left) / rect.width
      videoRef.current.currentTime = Math.max(0, Math.min(percent * duration, duration))
    }
  }

  const handleExport = async () => {
    if (!selectedMedia) return
    setExporting(true)
    try {
      const response = await fetch(`${API_URL}/api/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: selectedMedia.url,
          trimStart: parseTime(trimStart),
          trimEnd: parseTime(trimEnd),
          speed: speed,
          audio: audio,
        }),
      })
      if (response.ok) {
        const result = await response.json()
        alert('✅ Video đang được xuất. Job: ' + result.id)
      } else {
        alert('❌ Lỗi export')
      }
    } catch (err) {
      alert('❌ Lỗi: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  const handleSpeedChange = (e) => {
    const newSpeed = parseFloat(e.target.value)
    setSpeed(newSpeed)
    if (videoRef.current) {
      videoRef.current.playbackRate = newSpeed
    }
  }

  return (
    <div className="edit-tab">
      {error && (
        <div className="error-banner">
          <strong>⚠️ Lỗi:</strong> {error}
        </div>
      )}
      <div className="editor-container">
        {/* Left Panel - File List */}
        <aside className="left-panel">
          <h3>📁 Thư viện</h3>
          <div className="media-list">
            {loading ? (
              <div className="loading">⏳ Đang tải...</div>
            ) : media.length === 0 ? (
              <div className="empty">Chưa có video nào</div>
            ) : (
              media.map((item) => (
                <div
                  key={item.id}
                  className={`media-item ${selectedMedia?.id === item.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedMedia(item)
                    setIsPlaying(false)
                    setCurrentTime(0)
                  }}
                >
                  <div className="media-thumb">🎬</div>
                  <div className="media-info">
                    <div className="media-name">{item.name}</div>
                    <div className="media-size">{(item.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Center Panel - Preview */}
        <section className="center-panel">
          {selectedMedia ? (
            <div className="preview-container">
              <video
                ref={videoRef}
                className="preview-video"
                src={selectedMedia.url}
                onTimeUpdate={handleVideoTimeUpdate}
                onLoadedMetadata={handleVideoLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                crossOrigin="anonymous"
              />

              <div className="video-controls">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={togglePlayPause}
                >
                  {isPlaying ? '⏸ Tạm dừng' : '▶ Phát'}
                </Button>
              </div>

              <div className="timeline">
                <div
                  className="timeline-track"
                  onClick={handleTimelineClick}
                >
                  <div
                    className="timeline-progress"
                    style={{
                      width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="timeline-info">
                  <span>{formatTime(currentTime)}</span>
                  <span> / {formatTime(duration)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="preview-empty">
              <p>👈 Chọn video từ thư viện để xem trước</p>
            </div>
          )}
        </section>

        {/* Right Panel - Properties */}
        <aside className="right-panel">
          {selectedMedia ? (
            <div className="properties">
              <h3>⚙️ {selectedMedia.name}</h3>

              <div className="property-section">
                <label>Cắt video</label>
                <div className="trim-controls">
                  <input
                    type="text"
                    value={trimStart}
                    onChange={(e) => setTrimStart(e.target.value)}
                    placeholder="HH:MM:SS"
                    maxLength="8"
                  />
                  <span>→</span>
                  <input
                    type="text"
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(e.target.value)}
                    placeholder="HH:MM:SS"
                    maxLength="8"
                  />
                </div>
              </div>

              <div className="property-section">
                <label>Tốc độ: {speed}x</label>
                <div className="speed-slider">
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.25"
                    value={speed}
                    onChange={handleSpeedChange}
                  />
                </div>
              </div>

              <div className="property-section">
                <label>Âm thanh</label>
                <select
                  value={audio}
                  onChange={(e) => setAudio(e.target.value)}
                  className="audio-select"
                >
                  <option value="original">🔊 Âm gốc</option>
                  <option value="replace">🎵 Thay nhạc nền</option>
                  <option value="mute">🔇 Tắt tiếng</option>
                </select>
              </div>

              <div className="property-section">
                <label>Hiệu ứng</label>
                <div className="effects-grid">
                  <button className="effect-btn" disabled>✨ Mờ</button>
                  <button className="effect-btn" disabled>🌙 Làm tối</button>
                  <button className="effect-btn" disabled>☀️ Làm sáng</button>
                </div>
              </div>

              <Button
                variant="primary"
                size="md"
                onClick={handleExport}
                disabled={exporting}
                className="export-btn"
              >
                {exporting ? '⏳ Đang xuất...' : '📤 Xuất video'}
              </Button>
            </div>
          ) : (
            <div className="properties-empty">
              <p>👈 Chọn video để xem tùy chỉnh</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
