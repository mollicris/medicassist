import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'
import { swaggerSpec } from './config/swagger.js'
import chatRoutes from './routes/chat.js'
import appointmentRoutes from './routes/appointments.js'
import authRoutes from './routes/auth.js'
import webhookRoutes from './routes/webhooks.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGINS || 'https://tu-clinica.com').split(',').map(o => o.trim())
    : ['*'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true,
}))
app.use(express.json())

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
}))

app.use('/api/chat', chatRoutes)
app.use('/api/appointments', appointmentRoutes)
app.use('/auth', authRoutes)
app.use('/api/webhooks', webhookRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.use((_, res) => res.status(404).json({ error: 'Ruta no encontrada.' }))
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err)
  res.status(500).json({ error: 'Error interno del servidor.' })
})

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`)
})

console.log('Server initialized')

server.keepAliveTimeout = 65000

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT]', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[REJECTION]', reason)
  process.exit(1)
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 30000)
})
