import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter as BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './index.css'

// If Assembly loads us at /assembly?token=..., redirect to the hash-based route
// so HashRouter can pick it up as /#/assembly?token=...
const urlParams = new URLSearchParams(window.location.search)
const assemblyToken = urlParams.get('token')
if (assemblyToken && window.location.pathname.includes('assembly')) {
  window.location.replace(`/#/assembly?token=${encodeURIComponent(assemblyToken)}`)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
