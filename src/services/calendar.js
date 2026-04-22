import { google } from 'googleapis'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

// Cargar tokens si existen en .env
if (process.env.GOOGLE_ACCESS_TOKEN && process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    access_token: process.env.GOOGLE_ACCESS_TOKEN,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })
}

export const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

// Genera URL de autorización (solo se usa una vez por clínica)
export function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
  })
}

// Intercambia el code de callback por tokens y los guarda
export async function handleAuthCallback(code) {
  const { tokens } = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)
  return tokens
}

// Carga tokens guardados (desde DB o env en producción)
export function setCredentials(tokens) {
  oauth2Client.setCredentials(tokens)
}

// Obtiene slots disponibles para una fecha y especialidad
export async function getAvailableSlots(date, calendarId = 'primary') {
  const startOfDay = new Date(date)
  startOfDay.setHours(8, 0, 0, 0)

  const endOfDay = new Date(date)
  endOfDay.setHours(18, 0, 0, 0)

  const { data } = await calendar.events.list({
    calendarId,
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })

  const busySlots = (data.items || []).map(e => ({
    start: new Date(e.start.dateTime),
    end: new Date(e.end.dateTime),
  }))

  // Genera slots de 30 min de 8am a 6pm
  const allSlots = []
  for (let h = 8; h < 18; h++) {
    for (let m = 0; m < 60; m += 30) {
      allSlots.push({ hour: h, minute: m })
    }
  }

  return allSlots.filter(slot => {
    const slotStart = new Date(date)
    slotStart.setHours(slot.hour, slot.minute, 0, 0)
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000)

    return !busySlots.some(busy =>
      slotStart < busy.end && slotEnd > busy.start
    )
  }).map(s => `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`)
}

// Crea un evento en Google Calendar
export async function createAppointment({ patientName, specialty, date, time, calendarId = 'primary' }) {
  const [hour, minute] = time.split(':').map(Number)
  const start = new Date(date)
  start.setHours(hour, minute, 0, 0)
  const end = new Date(start.getTime() + 30 * 60 * 1000)

  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Cita: ${specialty} — ${patientName}`,
      description: `Paciente: ${patientName}\nEspecialidad: ${specialty}`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'email', minutes: 1440 }, { method: 'popup', minutes: 30 }],
      },
    },
  })

  return data.id
}

// Cancela un evento
export async function cancelAppointment(eventId, calendarId = 'primary') {
  await calendar.events.delete({ calendarId, eventId })
}
