import { useState, useEffect } from 'react'
import { endpoints } from '../../api/client'
import './DownloadTab.css'

const STATUS_LABELS = {
  queued: '⏳ Chờ xử lý',
  downloading: '⬇️ Đang tải',
  done: '✅ Hoàn thành',
  error: '❌ Lỗi',
  cancelled: '⛔ Đã hủy',
}

export default function DownloadTab() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState('')
  const [pollInterval, setPollInterval] = useState(null)

  // Fetch jobs on mount and setup polling
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const result = await endpoints.jobs()
        setJobs(result.jobs || [])
      } catch (err) {
        console.error('Fetch jobs error:', err)
      }
    }

    fetchJobs()

    // Poll for job updates every 2 seconds
    const interval = setInterval(fetchJobs, 2000)
    setPollInterval(interval)

    return () => clearInterval(interval)
  }, [])

  const handleDownload = async (e) => {
    e.preventDefault()
    if (!url.trim()) {
      setError('Vui lòng nhập URL video')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await endpoints.createDownloadJob(url.trim())
      if (result.jobs && result.jobs.length > 0) {
        setUrl('')
        setJobs(result.jobs.concat(jobs))
      } else {
        setError(result.error || 'Có lỗi khi tải video')
      }
    } catch (err) {
      setError(err.message || 'Không thể kết nối backend')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (jobId) => {
    try {
      await endpoints.jobCancel(jobId)
      setJobs(jobs.map(j => j.id === jobId ? { ...j, status: 'cancelled' } : j))
    } catch (err) {
      console.error('Cancel job error:', err)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'done': return 'completed'
      case 'downloading': return 'downloading'
      case 'queued': return 'pending'
      case 'error': return 'error'
      default: return 'pending'
    }
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return '-'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatProgress = (received, total) => {
    if (!total) return '0%'
    return Math.round((received / total) * 100) + '%'
  }

  return (
    <div className="download-tab">
      <div className="download-form-card">
        <h2>Tải xuống video</h2>
        <p>Dán link video từ TikTok, YouTube, RedNote, Telegram...</p>

        <form onSubmit={handleDownload}>
          <div className="form-group">
            <label htmlFor="url">URL video</label>
            <input
              id="url"
              type="text"
              placeholder="https://www.tiktok.com/... hoặc https://youtu.be/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="primary-btn"
          >
            {loading ? '⏳ Đang tải...' : '⬇️ Tải xuống'}
          </button>
        </form>
      </div>

      {jobs.length > 0 && (
        <div className="jobs-list">
          <h3>Hàng đợi tải xuống ({jobs.length})</h3>
          <div className="jobs-grid">
            {jobs.map((job) => (
              <div key={job.id} className="job-card">
                <div className="job-status">
                  <span className={`badge ${getStatusColor(job.status)}`}>
                    {STATUS_LABELS[job.status] || job.status}
                  </span>
                  {job.status === 'queued' || job.status === 'downloading' ? (
                    <button
                      className="cancel-btn"
                      onClick={() => handleCancel(job.id)}
                      title="Hủy job"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>

                <div className="job-info">
                  <p className="job-title">{job.url}</p>
                  <p className="job-time">
                    {new Date(job.createdAt).toLocaleString('vi-VN')}
                  </p>

                  {job.status === 'downloading' && (
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${formatProgress(job.received, job.total)}`,
                        }}
                      />
                      <span className="progress-text">
                        {formatFileSize(job.received)} / {formatFileSize(job.total)}
                      </span>
                    </div>
                  )}

                  {job.filename && (
                    <p className="job-filename">📁 {job.filename}</p>
                  )}

                  {job.error && (
                    <p className="job-error">❌ {job.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {jobs.length === 0 && !error && (
        <div className="empty-state">
          <p>Chưa có job nào. Nhập URL để bắt đầu tải xuống.</p>
        </div>
      )}
    </div>
  )
}
