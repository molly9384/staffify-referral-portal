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

export const forgotPassword = (email) =>
  apiClient.post('/auth/forgot-password', { email }).then((r) => r.data)

export const assemblyExchangeToken = (token) =>
  apiClient.post('/auth/assembly-token', { token }).then((r) => r.data)

export const assemblySignup = (token, full_name, password) =>
  apiClient.post('/auth/assembly-signup', { token, full_name, password }).then((r) => r.data)

export const registerClient = (data) =>
  apiClient.post('/auth/register-client', data).then((r) => r.data)

export const getPortalUsers = () =>
  apiClient.get('/auth/portal-users').then((r) => r.data)

export const deletePortalUser = (userId) =>
  apiClient.delete(`/auth/portal-users/${userId}`).then((r) => r.data)

export const archivePortalUser = (userId) =>
  apiClient.patch(`/auth/portal-users/${userId}/archive`).then((r) => r.data)

export const restorePortalUser = (userId) =>
  apiClient.patch(`/auth/portal-users/${userId}/restore`).then((r) => r.data)

export const impersonateUser = (userId) =>
  apiClient.post(`/auth/impersonate/${userId}`).then((r) => r.data)

export const sendInvite = (data) =>
  apiClient.post('/auth/invite', data).then((r) => r.data)

export const getInvite = (token) =>
  apiClient.get(`/auth/invite/${token}`).then((r) => r.data)

export const acceptInvite = (data) =>
  apiClient.post('/auth/accept-invite', data).then((r) => r.data)

export const resetPassword = (data) =>
  apiClient.post('/auth/reset-password', data).then((r) => r.data)

export const updateProfile = (data) =>
  apiClient.put('/auth/update-profile', data).then((r) => r.data)

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

export const deleteClient = (id) =>
  apiClient.delete(`/clients/${id}`).then((r) => r.data)

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

export const archiveReferral = (id) =>
  apiClient.patch(`/referrals/${id}/archive`).then((r) => r.data)

export const restoreReferral = (id) =>
  apiClient.patch(`/referrals/${id}/restore`).then((r) => r.data)

export const deleteReferral = (id) =>
  apiClient.delete(`/referrals/${id}`)

export const linkClients = (data) =>
  apiClient.post('/referrals/link-clients', data).then((r) => r.data)

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

export const pullCredits = () =>
  apiClient.post('/credits/pull-credits').then((r) => r.data)

export const verifyCredits = () =>
  apiClient.post('/credits/verify-credits').then((r) => r.data)

export const applyCredits = () =>
  apiClient.post('/credits/apply').then((r) => r.data)

export const syncVas = () =>
  apiClient.post('/credits/sync-vas').then((r) => r.data)

export const updateCredit = (id, data) =>
  apiClient.put(`/credits/${id}`, data).then((r) => r.data)

export const recalculateCredit = (id) =>
  apiClient.post(`/credits/${id}/recalculate`).then((r) => r.data)

export const deleteCredit = (id) =>
  apiClient.delete(`/credits/${id}`)

export const markCreditEligible = (id) =>
  apiClient.post(`/credits/${id}/mark-eligible`).then((r) => r.data)

export const restoreCredit = (id) =>
  apiClient.post(`/credits/${id}/restore`).then((r) => r.data)

// ---- Hubstaff ----

export const getHubstaffProjects = () =>
  apiClient.get('/hubstaff/projects').then((r) => r.data)

export const getHubstaffProjectMembers = (projectId) =>
  apiClient.get(`/hubstaff/project-members/${projectId}`).then((r) => r.data)

export const getHubstaffOrgMembers = () =>
  apiClient.get('/hubstaff/org-members').then((r) => r.data)

export const registerHubstaffWebhook = () =>
  apiClient.post('/hubstaff/register-webhook').then((r) => r.data)

// ---- Reports ----

export const getAdminReport = (params) =>
  apiClient.get('/reports/admin', { params }).then((r) => r.data)

export const getClientReport = (params) =>
  apiClient.get('/reports/client', { params }).then((r) => r.data)

export const sendReportEmail = (data) =>
  apiClient.post('/reports/send-email', data).then((r) => r.data)

// ---- QBO ----

export const getQBOStatus = () =>
  apiClient.get('/qbo/status').then((r) => r.data)

export const lookupQBOCustomer = (name) =>
  apiClient.get('/qbo/customer-lookup', { params: { name } }).then((r) => r.data)

export default apiClient
