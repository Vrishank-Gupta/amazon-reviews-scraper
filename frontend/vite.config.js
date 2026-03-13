import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        pipelineConsole: resolve(__dirname, 'pipeline-console.html'),
        weeklyRun: resolve(__dirname, 'weekly-run.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
})
