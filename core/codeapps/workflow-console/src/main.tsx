import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './features/instances/process-api'
import './features/tasks/task-api'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
