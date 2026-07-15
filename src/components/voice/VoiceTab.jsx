import { useState, useEffect } from 'react'
import { endpoints, parseVoices } from '../../api/client'
import './VoiceTab.css'

const PROVIDERS = {
  voicebox: { name: 'Voicebox', icon: '🎙️' },
  omnivoice: { name: 'OmniVoice', icon: '🎵' },
  vieneu: { name: 'VieNeu-TTS (Việt)', icon: '🇻🇳' },
}

export default function VoiceTab() {
  const [text, setText] = useState('')
  const [provider, setProvider] = useState('voicebox')
  const [profileId, setProfileId] = useState('')
  const [language, setLanguage] = useState('en')
  const [voiceStatus, setVoiceStatus] = useState(null)
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Fetch available voices
  useEffect(() => {
    const fetchVoiceStatus = async () => {
      try {
        const status = await endpoints.voiceStatus()
        setVoiceStatus(status)

        // Filter voices by selected provider
        const providerVoices = status.providers?.[provider]?.profiles || []
        setVoices(providerVoices)

        // Set first voice as default
        if (providerVoices.length > 0 && !profileId) {
          setProfileId(providerVoices[0].id)
        }
      } catch (err) {
        setError('Không thể tải danh sách giọng: ' + err.message)
      }
    }

    fetchVoiceStatus()
    // Poll for voice status changes every 5 seconds
    const interval = setInterval(fetchVoiceStatus, 5000)
    return () => clearInterval(interval)
  }, [provider, profileId])

  const currentProvider = voiceStatus?.providers?.[provider]
  const isConnected = currentProvider?.connected

  const handlePreview = async () => {
    if (!text.trim()) {
      setError('Vui lòng nhập lời thoại')
      return
    }
    if (!profileId) {
      setError('Vui lòng chọn giọng nói')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await endpoints.previewVoice({
        text: text.trim(),
        profileId,
        language,
        provider,
      })

      if (result.url) {
        const audio = new Audio(result.url)
        audio.onended = () => console.log('Preview audio finished')
        audio.play()
      } else if (result.error) {
        setError('Lỗi preview: ' + result.error)
      }
    } catch (err) {
      setError('Lỗi khi preview: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!text.trim()) {
      setError('Vui lòng nhập lời thoại')
      return
    }
    if (!profileId) {
      setError('Vui lòng chọn giọng nói')
      return
    }

    setCreating(true)
    setError('')
    setSuccess('')
    try {
      const result = await endpoints.generateVoice({
        text: text.trim(),
        profileId,
        language,
        provider,
      })

      if (result.job) {
        setText('')
        setSuccess('✅ Công việc đã được thêm vào hàng đợi')
        setTimeout(() => setSuccess(''), 3000)
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi tạo giọng nói')
    } finally {
      setCreating(false)
    }
  }

  const selectedVoice = voices.find(v => v.id === profileId)

  return (
    <div className="voice-tab">
      <div className="voice-form-card">
        <h2>Tạo giọng nói AI</h2>
        <p>Nhập lời thoại → chọn engine + giọng → tạo giọng đọc lồng tiếng</p>

        <div className="form-group">
          <label htmlFor="text">Lời thoại</label>
          <textarea
            id="text"
            placeholder="Nhập lời bình luận, lời thoại hoặc văn bản cần đọc..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={creating}
            rows={6}
          />
          <div className="char-count">{text.length} ký tự</div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="provider">Engine</label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value)
                setProfileId('')
              }}
              disabled={loading || creating}
            >
              {Object.entries(PROVIDERS).map(([key, val]) => {
                const isConnected = voiceStatus?.providers?.[key]?.connected
                return (
                  <option key={key} value={key}>
                    {isConnected ? '✅' : '❌'} {val.name}
                  </option>
                )
              })}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="voice">Giọng nói</label>
            <select
              id="voice"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              disabled={loading || creating || !isConnected || voices.length === 0}
            >
              <option value="">-- Chọn giọng --</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.language})
                </option>
              ))}
            </select>
            {!isConnected && (
              <div className="help-text">
                ⚠️ {PROVIDERS[provider]?.name} chưa khởi động. Vui lòng mở app.
              </div>
            )}
            {isConnected && voices.length === 0 && (
              <div className="help-text">
                📝 Chưa có giọng nào. Vui lòng tạo giọng trong app {PROVIDERS[provider]?.name}.
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="language">Ngôn ngữ</label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={creating}
            >
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
              <option value="zh">中文</option>
            </select>
          </div>
        </div>

        {selectedVoice && (
          <div className="voice-preview">
            <strong>Giọng đã chọn:</strong> {selectedVoice.name}
            <br />
            <small>Ngôn ngữ: {selectedVoice.language} · Engine: {selectedVoice.engine}</small>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="button-group">
          <button
            onClick={handlePreview}
            disabled={loading || creating || !text.trim() || !profileId || !isConnected}
            className="secondary-btn"
          >
            {loading ? '⏳ Đang xử lý...' : '🔊 Nghe thử'}
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !text.trim() || !profileId || !isConnected}
            className="primary-btn"
          >
            {creating ? '⏳ Đang tạo...' : '🎙️ Tạo giọng nói'}
          </button>
        </div>
      </div>
    </div>
  )
}
