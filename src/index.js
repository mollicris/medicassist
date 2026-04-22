import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'

console.log('Loading config...')
import { swaggerSpec } from './config/swagger.js'
import chatRoutes from './routes/chat.js'
import appointmentRoutes from './routes/appointments.js'
import authRoutes from './routes/auth.js'
import webhookRoutes from './routes/webhooks.js'

console.log('Creating app...')
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

app.get('/', (_, res) => res.json({ status: 'ok', service: 'MediAssist' }))
app.get('/health', (_, res) => res.json({ status: 'ok' }))

app.use((_, res) => res.status(404).json({ error: 'Not found' }))
app.use((err, _req, res, _next) => {
  console.error('Error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

console.log('Starting server on port', PORT)
try {
  const server = app.listen(PORT, () => {
    console.log('✅ Server running')
  })
  console.log('listen() called successfully')
} catch (err) {
  console.error('Error in listen():', err.message)
  process.exit(1)
}

server.keepAliveTimeout = 65000

setTimeout(() => {
  console.log('Server is alive')
}, 1000)

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received')
  server.close()
})

console.log('App initialized')
