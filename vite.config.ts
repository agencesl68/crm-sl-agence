import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  // Sur GitHub Pages, l'application vit sous /crm-sl-agence/
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  server: { port: 5183 },
  // Aperçu en ligne : un seul fichier, images incluses dans le code
  build: mode === 'preview' ? { outDir: 'dist-preview', assetsInlineLimit: 10_000_000, cssCodeSplit: false } : {},
}))
