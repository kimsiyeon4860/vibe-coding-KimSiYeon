import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import WakePrompt from './WakePrompt'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WakePrompt />
  </StrictMode>
)
