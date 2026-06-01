import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// backend/.env를 직접 파싱해 단일 source of truth로 사용. process.env가 있으면 우선.
function loadDotenv(file: string): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const text = readFileSync(file, 'utf-8')
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq < 0) continue
      out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
  } catch (e) {
    throw new Error(`backend/.env 로드 실패: ${file} — ${(e as Error).message}`)
  }
  return out
}

const here = dirname(fileURLToPath(import.meta.url))
const ENV_FILE = resolve(here, '../backend/.env')
const fileEnv = loadDotenv(ENV_FILE)

const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || fileEnv.BASIC_AUTH_USER || ''
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD || fileEnv.BASIC_AUTH_PASSWORD || ''

if (!BASIC_AUTH_USER || !BASIC_AUTH_PASSWORD) {
  throw new Error(
    `BASIC_AUTH_USER / BASIC_AUTH_PASSWORD 누락 — 확인 위치: 1) process.env  2) ${ENV_FILE}`
  )
}

const EXPECTED = 'Basic ' + Buffer.from(`${BASIC_AUTH_USER}:${BASIC_AUTH_PASSWORD}`).toString('base64')

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'basic-auth',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/health') return next()
          const auth = req.headers.authorization || ''
          if (auth === EXPECTED) return next()
          res.statusCode = 401
          res.setHeader('WWW-Authenticate', 'Basic realm="meeting-recorder"')
          res.end('Unauthorized')
        })
      },
    },
  ],
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        ws: true,
      },
    },
  },
})
