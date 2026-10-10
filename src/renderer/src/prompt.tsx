import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LifePrompt from './LifePrompt'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LifePrompt />
  </StrictMode>
)
