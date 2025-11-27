import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

// Custom plugin to ensure public directory is copied
const copyPublicPlugin = () => ({
  name: 'copy-public',
  closeBundle() {
    const publicDir = 'public'
    const outDir = 'dist'

    // Copy badges folder
    const badgesSource = join(publicDir, 'badges')
    const badgesTarget = join(outDir, 'badges')

    if (existsSync(badgesSource)) {
      if (!existsSync(badgesTarget)) {
        mkdirSync(badgesTarget, { recursive: true })
      }

      const files = readdirSync(badgesSource)
      files.forEach(file => {
        if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.svg')) {
          copyFileSync(join(badgesSource, file), join(badgesTarget, file))
          console.log(`Copied ${file} to dist/badges/`)
        }
      })
    }
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copyPublicPlugin()],

  // Load environment variables from root directory (shared with Django)
  envDir: '..',

  // Development server configuration
  server: {
    port: 5173,
    // Proxy API and media requests to Django backend
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/accounts': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/static': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Build configuration
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },

  // Explicitly set public directory
  publicDir: 'public',
})
