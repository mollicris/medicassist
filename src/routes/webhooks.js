import { Router } from 'express'
import { chat } from '../services/claude.js'
import { supabase } from '../config/supabase.js'

const router = Router()

// Servicio para enviar mensajes por WhatsApp
async function sendWhatsAppMessage(phoneNumber, message) {
  const url = `https://graph.instagram.com/v18.0/${process.env.META_PHONE_NUMBER_ID}/messages?access_token=${process.env.META_WHATSAPP_TOKEN}`

  const payload = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'text',
    text: { body: message },
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[WhatsApp API Error]', error)
      return null
    }

    const data = await response.json()
    return data.messages[0].id
  } catch (err) {
    console.error('[send WhatsApp message]', err)
    return null
  }
}

/**
 * @swagger
 * /api/webhooks/whatsapp:
 *   get:
 *     summary: Verificar webhook de WhatsApp
 *     description: Meta verifica que el webhook esté activo
 *     tags:
 *       - Webhooks
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.challenge
 *         schema:
 *           type: string
 *       - in: query
 *         name: hub.verify_token
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verificación exitosa
 *       403:
 *         description: Token inválido
 */
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode']
  const challenge = req.query['hub.challenge']
  const token = req.query['hub.verify_token']

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    res.status(200).send(challenge)
  } else {
    res.status(403).send('Forbidden')
  }
})

/**
 * @swagger
 * /api/webhooks/whatsapp:
 *   post:
 *     summary: Recibir mensajes de WhatsApp
 *     description: Meta envía mensajes del usuario al webhook
 *     tags:
 *       - Webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Mensaje procesado
 *       500:
 *         description: Error al procesar
 */
router.post('/whatsapp', async (req, res) => {
  try {
    const body = req.body

    // Meta espera una respuesta 200 inmediatamente
    res.status(200).send('OK')

    // Procesar el webhook de forma asíncrona
    if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages) {
      const message = body.entry[0].changes[0].value.messages[0]
      const senderPhone = message.from
      const messageText = message.text?.body || ''
      const messageId = message.id

      if (!messageText) return

      console.log(`[WhatsApp] De ${senderPhone}: ${messageText}`)

      try {
        // Obtener o crear conversación
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('*')
          .eq('channel', 'whatsapp')
          .eq('patient_phone', senderPhone)
          .gte('last_activity', since)
          .order('last_activity', { ascending: false })
          .limit(1)
          .single()

        let history = existingConv?.messages || []

        // Agregar mensaje del usuario
        const updatedHistory = [...history, { role: 'user', content: messageText }]

        // Llamar a Claude
        const { reply, updatedMessages } = await chat({
          messages: updatedHistory,
          patientPhone: senderPhone,
        })

        // Guardar conversación
        const finalHistory = [...updatedMessages, { role: 'assistant', content: reply }]

        if (existingConv) {
          await supabase
            .from('conversations')
            .update({ messages: finalHistory, last_activity: new Date().toISOString() })
            .eq('id', existingConv.id)
        } else {
          await supabase
            .from('conversations')
            .insert({
              channel: 'whatsapp',
              patient_phone: senderPhone,
              messages: finalHistory,
            })
        }

        // Enviar respuesta por WhatsApp
        await sendWhatsAppMessage(senderPhone, reply)

        console.log(`[WhatsApp] Respuesta enviada a ${senderPhone}`)
      } catch (err) {
        console.error('[WhatsApp message processing]', err)
        // Enviar mensaje de error al usuario
        await sendWhatsAppMessage(senderPhone, 'Disculpa, hubo un error. Intenta nuevamente.')
      }
    }
  } catch (err) {
    console.error('[webhook whatsapp]', err)
    res.status(500).json({ error: 'Error procesando webhook' })
  }
})

export default router
