const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3210'

export const api = {
  get: async (path) => {
    const res = await fetch(`${API_URL}${path}`)
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
  post: async (path, data) => {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
  put: async (path, data) => {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
}

export const endpoints = {
  // System status
  status: () => api.get('/api/status'),

  // Jobs - video download
  jobs: () => api.get('/api/jobs'),
  jobDetail: (id) => api.get(`/api/jobs/${id}`),
  createDownloadJob: (urls) => api.post('/api/jobs', { urls: Array.isArray(urls) ? urls : [urls] }),
  jobCancel: (id) => api.put(`/api/jobs/${id}`, { status: 'cancelled' }),

  // Voice/TTS - with backend structure (providers)
  voiceStatus: () => api.get('/api/voice/status'),
  previewVoice: (data) => api.post('/api/voice/preview', data),
  generateVoice: (data) => api.post('/api/voice/generate', data),

  // Music/audio
  musicList: () => api.get('/api/music'),
}

// Helper to extract voices from voice/status response
export const parseVoices = (voiceStatus) => {
  const voices = []
  if (voiceStatus?.providers) {
    Object.entries(voiceStatus.providers).forEach(([provider, data]) => {
      if (data.profiles) {
        data.profiles.forEach(profile => {
          voices.push({
            ...profile,
            provider,
            connected: data.connected,
          })
        })
      }
    })
  }
  return voices
}
