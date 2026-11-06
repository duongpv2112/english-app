import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'

const config = loadConfig(process.env)
const app = await buildApp(config)
await app.listen({ host: '0.0.0.0', port: config.port })
