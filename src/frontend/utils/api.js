import { http, isAdminLoggedIn } from './http'
import { getApiBase, getWsBase } from './config'

export { getApiBase, getWsBase }

export const createLiveSocket = (subscribe, handlers = {}) => {
  const { onUpdate, onStatus, onMessage } = handlers
  const scope = (subscribe || 'all').toLowerCase()
  let ws = null
  let manualClose = false
  let reconnectTimer = null
  let reconnectDelay = 1000
  let reconnectAttempts = 0
  const MAX_DELAY = 30000
  const MAX_RECONNECT_ATTEMPTS = 10

  const setStatus = (connected, reason) => {
    if (typeof onStatus === 'function') {
      onStatus({ connected, reason: reason || '' })
    }
  }

  const connect = () => {
    manualClose = false
    try {
      ws = new WebSocket(`${getWsBase()}/api/ws?subscribe=${encodeURIComponent(scope)}`)
    } catch (e) {
      setStatus(false, 'WebSocket not supported')
      return
    }

    ws.addEventListener('open', () => {
      reconnectDelay = 1000
      reconnectAttempts = 0
      setStatus(true, 'connected')
    })

    ws.addEventListener('message', (event) => {
      let msg = null
      try {
        msg = typeof event.data === 'string' ? JSON.parse(event.data) : null
      } catch (_) { return }
      if (!msg) return

      if (msg.type === 'update' && typeof onUpdate === 'function') {
        onUpdate({ serverId: msg.serverId, data: msg.data })
      }
      if (typeof onMessage === 'function') onMessage(msg)
    })

    ws.addEventListener('close', () => {
      setStatus(false, 'disconnected')
      scheduleReconnect()
    })

    ws.addEventListener('error', () => {
      setStatus(false, 'error')
      try { ws.close() } catch (_) {}
    })
  }

  const scheduleReconnect = () => {
    if (manualClose) return
    if (reconnectTimer) return
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      setStatus(false, 'max reconnect attempts reached')
      return
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      reconnectAttempts++
      const delay = reconnectDelay
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY)
      setTimeout(connect, delay)
    }, 50)
  }

  connect()

  return {
    close() {
      manualClose = true
      reconnectAttempts = MAX_RECONNECT_ATTEMPTS
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      if (ws) { try { ws.close() } catch (_) {} ws = null }
    },
    reconnect() {
      manualClose = false
      reconnectAttempts = 0
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      if (ws) { try { ws.close() } catch (_) {} ws = null }
      connect()
    }
  }
}

export const getFlagRegionCode = (region) => {
  const code = (region || '').toUpperCase()
  if (code === 'TW' || code === 'HK' || code === 'MO') return 'cn'
  return code.toLowerCase()
}

export const formatBytes = (bytes) => {
  bytes = parseFloat(bytes) || 0
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  // 确保 i 在有效范围内（防止负数索引或超出数组范围）
  const safeIndex = Math.max(0, Math.min(i, sizes.length - 1))
  return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(2)) + ' ' + sizes[safeIndex]
}

export const fetchServers = async () => {
  const result = await http.get('/api/servers')
  if (result.error) return null
  return result.data
}

export const fetchServerDetail = async (id) => {
  const result = await http.get(`/api/server?id=${id}`)
  if (result.error) return null
  return result.data
}

export const fetchAllHistory = async (id, hours) => {
  const result = await http.get(`/api/history/all?id=${id}&hours=${hours}`)
  if (result.error) {
    const error = new Error(result.error)
    error.code = result.code
    error.status = result.status
    error.message = result.message || result.error
    throw error
  }
  return result.data
}

export const adminApi = async (data) => {
  const result = await http.post('/admin/api', data)
  return result
}

export const login = async (username, password, turnstileToken = '') => {
  const result = await http.post('/admin/api', { action: 'login', username, password }, { autoRedirect: false })
  
  if (!result.error && result.data && result.data.token) {
    localStorage.setItem('jwt_token', result.data.token)
  }
  return result
}

export const logout = () => {
  localStorage.removeItem('jwt_token')
}

export const fetchConfig = async () => {
  const result = await http.get('/api/config', { includeAuth: false, includeTurnstile: false })
  if (result.error) return null
  return result.data
}

export const upgradeDatabase = async () => {
  const result = await http.post('/updateDatabase', {}, { autoRedirect: false })
  if (result.error) {
    if (result.status === 401) {
      return { success: false, error: 'Unauthorized' }
    }
    return { success: false, error: 'Request failed' }
  }
  return result.data
}

export const rebuildDatabase = async () => {
  const result = await http.post('/rebuild', {}, { autoRedirect: false })
  if (result.error) {
    if (result.status === 401) {
      return { success: false, error: 'Unauthorized' }
    }
    return { success: false, error: 'Request failed' }
  }
  return result.data
}

export { isAdminLoggedIn }
