import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './options.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Options root element missing')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
