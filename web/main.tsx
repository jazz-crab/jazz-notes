import { installWebJazz } from './webjazz'
installWebJazz()

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../src/renderer/src/App'
import '../src/renderer/src/App.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
