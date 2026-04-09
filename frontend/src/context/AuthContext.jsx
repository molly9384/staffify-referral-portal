import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { login as apiLogin, getMe } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const storedUser = localStorage.getItem('user')
    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('user')
      }
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password)
    localStorage.setItem('access_token', data.access_token)
    const userData = {
      id: data.user_id,
      full_name: data.full_name,
      role: data.role,
      client_id: data.client_id || null,
    }
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }, [])

  const loginWithToken = useCallback((data) => {
    localStorage.setItem('access_token', data.access_token)
    const userData = {
      id: data.user_id,
      full_name: data.full_name,
      role: data.role,
      client_id: data.client_id || null,
    }
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    setUser(null)
  }, [])

  const startImpersonation = useCallback((data) => {
    // Save admin's current session
    localStorage.setItem('admin_token', localStorage.getItem('access_token'))
    localStorage.setItem('admin_user', localStorage.getItem('user'))
    // Swap in client session
    localStorage.setItem('access_token', data.access_token)
    const clientUser = {
      id: data.user_id,
      full_name: data.full_name,
      role: data.role,
      client_id: data.client_id || null,
    }
    localStorage.setItem('user', JSON.stringify(clientUser))
    setUser(clientUser)
  }, [])

  const stopImpersonation = useCallback(() => {
    const adminToken = localStorage.getItem('admin_token')
    const adminUser = localStorage.getItem('admin_user')
    if (adminToken) localStorage.setItem('access_token', adminToken)
    if (adminUser) {
      localStorage.setItem('user', adminUser)
      try { setUser(JSON.parse(adminUser)) } catch { /* ignore */ }
    }
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
  }, [])

  const isImpersonating = !!localStorage.getItem('admin_token')

  const refreshUser = useCallback(async () => {
    try {
      const data = await getMe()
      const userData = {
        id: data.id,
        full_name: data.full_name,
        role: data.role,
        client_id: data.client_id,
        email: data.email,
      }
      localStorage.setItem('user', JSON.stringify(userData))
      setUser(userData)
      return userData
    } catch {
      logout()
    }
  }, [logout])

  const value = {
    user,
    loading,
    login,
    loginWithToken,
    logout,
    refreshUser,
    startImpersonation,
    stopImpersonation,
    isImpersonating,
    isOwner: user?.role === 'owner',
    isAdmin: user?.role === 'admin' || user?.role === 'owner',
    isStaff: user?.role === 'staff',
    isClient: user?.role === 'client',
    isInternal: user?.role === 'admin' || user?.role === 'staff' || user?.role === 'owner',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
