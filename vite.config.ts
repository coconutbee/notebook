import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 要和 GitHub repo 名稱一致：https://<帳號>.github.io/notebook/
export default defineConfig({
  base: '/notebook/',
  plugins: [react()],
})
