import { installWebJazz } from './webjazz'
installWebJazz()

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../src/renderer/src/App'
import { useSettingsStore } from '../src/renderer/src/stores/settings'
import '../src/renderer/src/App.css'

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
