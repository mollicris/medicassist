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

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet())
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.CORS_ORIGINS || 'https://tu-clinica.com').split(',').map(o => o.trim())
  : ['*']

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true,
  optionsSuccessStatus: 200,
}))
app.use(express.json())

// ─── Swagger Documentation ────────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
}))

// ─── Rutas ────────────────────────────────────────────────────────────────────

app.use('/api/chat', chatRoutes)
app.use('/api/appointments', appointmentRoutes)
app.use('/auth', authRoutes)
app.use('/api/webhooks', webhookRoutes)

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Verifica que el servidor esté funcionando
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Servidor activo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'MediAssist API' }))

// 404
app.use((_, res) => res.status(404).json({ error: 'Ruta no encontrada.' }))

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Error interno del servidor.' })
})

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🏥 MediAssist API corriendo en http://localhost:${PORT}`)
  console.log(`📋 Entorno: ${process.env.NODE_ENV || 'development'}`)
})

// Manejo de errores no capturados
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason)
  process.exit(1)
})
