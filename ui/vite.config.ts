import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import checker from 'vite-plugin-checker'
import path from 'path'

export default defineConfig({
  base: '/ui/',
  plugins: [react(), checker({ typescript: true })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react-router'))
              return 'vendor-react'
            if (id.includes('@mui/icons-material'))
              return 'vendor-mui-icons'
            if (id.includes('@mui/') || id.includes('@emotion/'))
              return 'vendor-mui'
            if (id.includes('@uiw/react-md-editor') || id.includes('@uiw/react-markdown-preview') || id.includes('codemirror') || id.includes('@codemirror/') || id.includes('@lezer/'))
              return 'vendor-md-editor'
            if (id.includes('react-markdown') || id.includes('remark-gfm') || id.includes('rehype') || id.includes('remark') || id.includes('unified') || id.includes('mdast') || id.includes('hast') || id.includes('micromark') || id.includes('unist'))
              return 'vendor-markdown'
            if (id.includes('cytoscape'))
              return 'vendor-graph'
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
})
