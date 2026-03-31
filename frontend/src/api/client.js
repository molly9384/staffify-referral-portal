import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: attach JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Response interceptor: handle 401 (unauthorized)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      // Use hash-based path for HashRouter compatibility
      if (!window.location.hash.includes('/login')) {
        window.location.href = '/#/login'
      }
    }
    return Promise.reject(error)
  },
)

// ---- Auth ----

export const login = (email, password) =>
  apiClient.post('/auth/login', { email, password }).then((r) => r.data)

export const getMe = () =>
  apiClient.get('/auth/me').then((r) => r.data)

export const changePassword = (data) =>
  apiClient.put('/auth/change-password', data).then((r) => r.data)

export const registerUser = (data) =>
  apiClient.post('/auth/register', data).then((r) => r.data)

// ---- Clients ----

export const getClients = () =>
  apiClient.get('/clients').then((r) => r.data)

export const getClient = (id) =>
  apiClient.get(`/clients/${id}`).then((r) => r.data)

export const createClient = (data) =>
  apiClient.post('/clients', data).then((r) => r.data)

export const updateClient = (id, data) =>
  apiClient.put(`/clients/${id}`, data).then((r) => r.data)

export const getClientReferrals = (id) =>
  apiClient.get(`/clients/${id}/referrals`).then((r) => r.data)

// ---- Referrals ----

export const getReferrals = (params) =>
  apiClient.get('/referrals', { params }).then((r) => r.data)

export const getReferral = (id) =>
  apiClient.get(`/referrals/${id}`).then((r) => r.data)

export const createReferral = (data) =>
  apiClient.post('/referrals', data).then((r) => r.data)

export const updateReferral = (id, data) =>
  apiClient.put(`/referrals/${id}`, data).then((r) => r.data)

export const updateReferralStatus = (id, data) =>
  apiClient.put(`/referrals/${id}/status`, data).then((r) => r.data)

export const getReferralCredits = (id) =>
  apiClient.get(`/referrals/${id}/credits`).then((r) => r.data)

// ---- Virtual Assistants ----

export const getVAsForReferral = (referralId) =>
  apiClient.get(`/referrals/${referralId}/vas`).then((r) => r.data)

export const addVA = (referralId, data) =>
  apiClient.post(`/referrals/${referralId}/vas`, data).then((r) => r.data)

export const updateVA = (vaId, data) =>
  apiClient.put(`/vas/${vaId}`, data).then((r) => r.data)

export const terminateVA = (vaId, data) =>
  apiClient.post(`/vas/${vaId}/terminate`, data).then((r) => r.data)

export const setEligibleVA = (referralId, vaId) =>
  apiClient.post(`/referrals/${referralId}/vas/${vaId}/set-eligible`).then((r) => r.data)

// ---- Credits ----

export const getCredits = (params) =>
  apiClient.get('/credits', { params }).then((r) => r.data)

export const getPendingCredits = () =>
  apiClient.get('/credits/pending').then((r) => r.data)

export const getCreditSummary = () =>
  apiClient.get('/credits/summary').then((r) => r.data)

export const runCreditAutomation = () =>
  apiClient.post('/credits/run-automation').then((r) => r.data)

export const applyCredits = () =>
  apiClient.post('/credits/apply').then((r) => r.data)

// ---- Hubstaff ----

export const getHubstaffProjects = () =>
  apiClient.get('/hubstaff/projects').then((r) => r.data)

export const registerHubstaffWebhook = () =>
  apiClient.post('/hubstaff/register-webhook').then((r) => r.data)

// ---- QBO ----

export const getQBOStatus = () =>
  apiClient.get('/qbo/status').then((r) => r.data)

export default apiClient
