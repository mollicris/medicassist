import { Router } from 'express'
import { chat } from '../services/claude.js'
import { supabase } from '../config/supabase.js'

const router = Router()

/**
 * @swagger
 * /api/chat:
 *   post:
 *     summary: Enviar mensaje al asistente
 *     description: Procesa un mensaje del paciente y retorna respuesta de Claude
 *     tags:
 *       - Chat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: Mensaje del paciente
 *               patientPhone:
 *                 type: string
 *                 description: Teléfono del paciente (opcional)
 *               conversationId:
 *                 type: string
 *                 description: ID de conversación existente (opcional)
 *     responses:
 *       200:
 *         description: Respuesta exitosa del asistente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reply:
 *                   type: string
 *                 conversationId:
 *                   type: string
 *       400:
 *         description: Mensaje vacío
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', async (req, res) => {
  try {
    const { message, patientPhone, conversationId } = req.body

    // Validaciones
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'El mensaje es requerido y debe ser texto.' })
    }

    if (!message.trim()) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío.' })
    }

    if (message.length > 5000) {
      return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 5000 caracteres).' })
    }

    if (patientPhone && !/^\+?[0-9\s\-\(\)]{10,}$/.test(patientPhone)) {
      return res.status(400).json({ error: 'Formato de teléfono inválido.' })
    }

    if (conversationId && typeof conversationId !== 'string') {
      return res.status(400).json({ error: 'ID de conversación inválido.' })
    }

    // Carga o crea conversación
    let conversation = null
    let history = []

    if (conversationId) {
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single()
      conversation = data
      history = data?.messages || []
    }

    if (!conversation && patientPhone) {
      // Busca conversación activa del mismo paciente (última 24h)
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('channel', 'web')
        .gte('last_activity', since)
        .order('last_activity', { ascending: false })
        .limit(1)
        .single()

      if (data) {
        conversation = data
        history = data.messages || []
      }
    }

    // Agrega el mensaje del usuario al historial
    const updatedHistory = [...history, { role: 'user', content: message }]

    // Llama a Claude
    const { reply, updatedMessages } = await chat({
      messages: updatedHistory,
      patientPhone,
    })

    // Agrega la respuesta al historial
    const finalHistory = [...updatedMessages, { role: 'assistant', content: reply }]

    // Guarda o actualiza conversación en Supabase
    let savedId = conversation?.id

    if (conversation) {
      await supabase
        .from('conversations')
        .update({ messages: finalHistory, last_activity: new Date().toISOString() })
        .eq('id', conversation.id)
    } else {
      // Resuelve patient_id si hay teléfono
      let patientId = null
      if (patientPhone) {
        const { data: patient } = await supabase
          .from('patients')
          .select('id')
          .eq('phone', patientPhone)
          .single()
        patientId = patient?.id || null
      }

      const { data } = await supabase
        .from('conversations')
        .insert({ patient_id: patientId, messages: finalHistory, channel: 'web' })
        .select()
        .single()

      savedId = data?.id
    }

    res.json({ reply, conversationId: savedId })
  } catch (err) {
    console.error('[chat]', err.message)

    if (err.message?.includes('agentic loop')) {
      return res.status(500).json({ error: 'Error procesando la solicitud. Intenta nuevamente.' })
    }

    if (err.message?.includes('SUPABASE') || err.message?.includes('database')) {
      return res.status(503).json({ error: 'Base de datos no disponible. Intenta más tarde.' })
    }

    res.status(500).json({ error: 'Error interno del servidor.' })
  }
})

/**
 * @swagger
 * /api/chat/{conversationId}:
 *   get:
 *     summary: Obtener historial de conversación
 *     description: Recupera el historial completo de una conversación
 *     tags:
 *       - Chat
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la conversación
 *     responses:
 *       200:
 *         description: Historial de conversación
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 messages:
 *                   type: array
 *                 patient_id:
 *                   type: string
 *                 last_activity:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Conversación no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:conversationId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', req.params.conversationId)
      .single()

    if (error || !data) return res.status(404).json({ error: 'Conversación no encontrada.' })

    res.json(data)
  } catch (err) {
    console.error('[get conversation]', err)
    res.status(500).json({ error: 'Error interno.' })
  }
})

export default router
