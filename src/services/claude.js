import Anthropic from '@anthropic-ai/sdk'
import { getAvailableSlots, createAppointment, cancelAppointment } from './calendar.js'
import { supabase } from '../config/supabase.js'

console.log('[claude.js] Inicializando Anthropic...')
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[claude.js ERROR] ANTHROPIC_API_KEY no configurada')
  process.exit(1)
}

let anthropic
try {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  console.log('[claude.js] Anthropic inicializado correctamente')
} catch (err) {
  console.error('[claude.js ERROR]', err.message)
  process.exit(1)
}

// ─── Herramientas que Claude puede ejecutar ───────────────────────────────────

const tools = [
  {
    name: 'get_available_slots',
    description: 'Obtiene los horarios disponibles para agendar una cita en una fecha específica.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        specialty: { type: 'string', description: 'Especialidad médica solicitada' },
      },
      required: ['date', 'specialty'],
    },
  },
  {
    name: 'book_appointment',
    description: 'Agenda una cita médica para el paciente.',
    input_schema: {
      type: 'object',
      properties: {
        patient_name: { type: 'string' },
        patient_phone: { type: 'string' },
        specialty: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM' },
        notes: { type: 'string', description: 'Motivo de consulta (opcional)' },
      },
      required: ['patient_name', 'patient_phone', 'specialty', 'date', 'time'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancela una cita existente del paciente.',
    input_schema: {
      type: 'object',
      properties: {
        patient_phone: { type: 'string' },
        appointment_id: { type: 'string' },
      },
      required: ['patient_phone'],
    },
  },
  {
    name: 'get_patient_appointments',
    description: 'Consulta las citas próximas de un paciente.',
    input_schema: {
      type: 'object',
      properties: {
        patient_phone: { type: 'string' },
      },
      required: ['patient_phone'],
    },
  },
]

// ─── Ejecutor de herramientas ─────────────────────────────────────────────────

async function executeTool(name, input) {
  switch (name) {
    case 'get_available_slots': {
      if (!input.date || !input.specialty) {
        throw new Error('Faltan parámetros: date y specialty requeridos')
      }
      const slots = await getAvailableSlots(input.date)
      if (!slots.length) return 'No hay horarios disponibles para esa fecha. ¿Quieres que verifique otro día?'
      return `Horarios disponibles el ${input.date} para ${input.specialty}:\n${slots.slice(0, 6).join(', ')}`
    }

    case 'book_appointment': {
      if (!input.patient_name || !input.patient_phone || !input.specialty || !input.date || !input.time) {
        throw new Error('Faltan parámetros requeridos para agendar cita')
      }
      // 1. Upsert paciente
      const { data: patient } = await supabase
        .from('patients')
        .upsert({ phone: input.patient_phone, name: input.patient_name }, { onConflict: 'phone' })
        .select()
        .single()

      // 2. Crear evento en Google Calendar
      const eventId = await createAppointment({
        patientName: input.patient_name,
        specialty: input.specialty,
        date: input.date,
        time: input.time,
      })

      // 3. Guardar en Supabase
      const { data: appt } = await supabase
        .from('appointments')
        .insert({
          patient_id: patient.id,
          specialty: input.specialty,
          date: input.date,
          time: input.time,
          google_event_id: eventId,
          notes: input.notes || null,
        })
        .select()
        .single()

      return `Cita agendada exitosamente ✅\n- Especialidad: ${input.specialty}\n- Fecha: ${input.date} a las ${input.time}\n- ID de cita: ${appt.id.slice(0, 8)}`
    }

    case 'cancel_appointment': {
      if (!input.patient_phone) {
        throw new Error('El teléfono del paciente es requerido para cancelar una cita')
      }
      const { data: patient } = await supabase
        .from('patients')
        .select('id')
        .eq('phone', input.patient_phone)
        .single()

      if (!patient) return 'No encontré un paciente registrado con ese número.'

      const query = supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', patient.id)
        .eq('status', 'scheduled')

      if (input.appointment_id) query.eq('id', input.appointment_id)

      const { data: appts } = await query.order('date').limit(1)

      if (!appts?.length) return 'No encontré citas activas para cancelar.'

      const appt = appts[0]
      if (appt.google_event_id) await cancelAppointment(appt.google_event_id)

      await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id)

      return `Cita cancelada ✅\n- ${appt.specialty} del ${appt.date} a las ${appt.time}`
    }

    case 'get_patient_appointments': {
      if (!input.patient_phone) {
        throw new Error('El teléfono del paciente es requerido')
      }
      const { data: patient } = await supabase
        .from('patients')
        .select('id, name')
        .eq('phone', input.patient_phone)
        .single()

      if (!patient) return 'No encontré un paciente con ese número.'

      const { data: appts } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', patient.id)
        .eq('status', 'scheduled')
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date')

      if (!appts?.length) return `Hola ${patient.name}, no tienes citas próximas agendadas.`

      const list = appts.map(a => `• ${a.specialty} — ${a.date} a las ${a.time}`).join('\n')
      return `Tus próximas citas:\n${list}`
    }

    default:
      return 'Herramienta no reconocida.'
  }
}

// ─── Función principal: chat con Claude ──────────────────────────────────────

export async function chat({ messages, patientPhone }) {
  const systemPrompt = `Eres el asistente virtual de ${process.env.CLINIC_NAME || 'la clínica'}.
Tu función es ayudar a los pacientes a:
- Agendar, consultar y cancelar citas médicas
- Responder preguntas sobre servicios, especialidades y precios
- Orientar en caso de urgencias

Especialidades disponibles: ${process.env.CLINIC_SPECIALTIES || 'Medicina general, Pediatría, Ginecología, Cardiología'}
Teléfono de emergencias: ${process.env.CLINIC_PHONE}
Dirección: ${process.env.CLINIC_ADDRESS}

Reglas:
- Responde siempre en español, con tono cálido y profesional
- Para urgencias graves, da el teléfono de emergencias de inmediato
- Si el paciente quiere agendar, obtén: especialidad, fecha preferida y nombre completo
- El teléfono del paciente es: ${patientPhone || 'desconocido'}
- No inventes horarios disponibles; usa la herramienta get_available_slots
- Mantén respuestas cortas y claras (máximo 3-4 líneas)`

  let response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    tools,
    messages,
  })

  // Agentic loop: ejecuta herramientas si Claude las solicita
  let loopCount = 0
  const maxLoops = 10

  while (response.stop_reason === 'tool_use' && loopCount < maxLoops) {
    loopCount++
    const toolUses = response.content.filter(b => b.type === 'tool_use')

    try {
      const toolResults = await Promise.all(
        toolUses.map(async tool => {
          try {
            const content = await executeTool(tool.name, tool.input)
            return {
              type: 'tool_result',
              tool_use_id: tool.id,
              content,
            }
          } catch (err) {
            console.error(`[tool error: ${tool.name}]`, err)
            return {
              type: 'tool_result',
              tool_use_id: tool.id,
              content: `Error ejecutando la herramienta: ${err.message}`,
              is_error: true,
            }
          }
        })
      )

      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ]

      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages,
      })
    } catch (err) {
      console.error('[agentic loop error]', err)
      throw new Error(`Error en el agentic loop: ${err.message}`)
    }
  }

  if (loopCount >= maxLoops) {
    console.warn('[agentic loop] Alcanzado límite máximo de iteraciones')
  }

  const text = response.content.find(b => b.type === 'text')?.text || ''
  return { reply: text, updatedMessages: messages }
}
