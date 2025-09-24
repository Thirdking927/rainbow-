```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
plugins: [
react(),
VitePWA({
registerType: 'autoUpdate',
injectRegister: 'auto',
manifest: {
name: 'Bitcoin Rainbow Chart',
short_name: 'RainbowBTC',
description: 'Log-regression rainbow bands + halving lines',
theme_color: '#0f0f10',
background_color: '#0f0f10',
display: 'standalone',
icons: [
{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
]
}
})
]
})
```
