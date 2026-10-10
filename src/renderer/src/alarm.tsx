import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AlarmPopup from './AlarmPopup'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AlarmPopup />
  </StrictMode>
)
