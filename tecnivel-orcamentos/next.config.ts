import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O repositório tem outro app na raiz; sem isto o Next escolhe o lockfile errado.
  outputFileTracingRoot: path.join(__dirname),
}

export default nextConfig
