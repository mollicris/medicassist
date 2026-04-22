import { Router } from 'express'
import { getAuthUrl, handleAuthCallback } from '../services/calendar.js'
import { supabase } from '../config/supabase.js'

const router = Router()

/**
 * @swagger
 * /auth/google:
 *   get:
 *     summary: Iniciar autenticación con Google
 *     description: Redirige al usuario a Google para autorizar acceso al calendario
 *     tags:
 *       - Auth
 *     responses:
 *       302:
 *         description: Redirecciona a Google OAuth
 */
router.get('/google', (req, res) => {
  const url = getAuthUrl()
  res.redirect(url)
})

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     summary: Callback de Google OAuth
 *     description: Google redirige aquí después de la autorización
 *     tags:
 *       - Auth
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Código de autorización de Google
 *     responses:
 *       200:
 *         description: Tokens obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 tokens:
 *                   type: object
 *       400:
 *         description: Código faltante
 *       500:
 *         description: Error en la autenticación
 */
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query

    // Validar si Google devolvió un error
    if (error) {
      console.warn(`[google callback error] ${error}: ${error_description}`)
      return res.status(400).send(`Error de Google: ${error_description || error}`)
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).send('Código de autorización faltante o inválido.')
    }

    const tokens = await handleAuthCallback(code)

    // En producción guardarías esto en la tabla de clínica en Supabase
    // Por ahora lo mostramos para que el developer lo copie al .env
    res.json({
      message: 'Google Calendar conectado exitosamente ✅',
      note: 'Guarda estos tokens en tu base de datos asociados a la clínica.',
      tokens,
    })
  } catch (err) {
    console.error('[google callback]', err)
    res.status(500).send('Error al conectar Google Calendar.')
  }
})

export default router
