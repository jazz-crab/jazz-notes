import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useSettingsStore } from './stores/settings'
import './App.css'

void useSettingsStore.getState().hydrate()

function Root() {
  const hydrated = useSettingsStore((s) => s.hydrated)
  if (!hydrated) return <div />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
