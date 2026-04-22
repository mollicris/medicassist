console.log('[START] Iniciando servidor...')

import 'dotenv/config'
console.log('[OK] dotenv cargado')

import express from 'express'
console.log('[OK] express cargado')

import cors from 'cors'
console.log('[OK] cors cargado')

import helmet from 'helmet'
console.log('[OK] helmet cargado')

import swaggerUi from 'swagger-ui-express'
console.log('[OK] swagger-ui-express cargado')

console.log('[LOAD] Cargando rutas y config...')
import { swaggerSpec } from './config/swagger.js'
console.log('[OK] swagger config cargado')

import chatRoutes from './routes/chat.js'
console.log('[OK] chat routes cargado')

import appointmentRoutes from './routes/appointments.js'
console.log('[OK] appointments routes cargado')

import authRoutes from './routes/auth.js'
console.log('[OK] auth routes cargado')

import webhookRoutes from './routes/webhooks.js'
console.log('[OK] webhooks routes cargado')

console.log('[SETUP] Configurando app...')
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

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'MediAssist API' }))

app.use((_, res) => res.status(404).json({ error: 'Ruta no encontrada.' }))
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err)
  res.status(500).json({ error: 'Error interno del servidor.' })
})

console.log('[LISTEN] Escuchando en puerto', PORT)
app.listen(PORT, () => {
  console.log(`🏥 MediAssist API corriendo en http://localhost:${PORT}`)
})

process.on('uncaughtException', (err) => {
  console.error('[CRASH]', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[REJECT]', reason)
  process.exit(1)
})

console.log('[READY] Servidor listo')
