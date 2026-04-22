# MediAssist Backend

Backend para el asistente de IA de clínicas médicas.  
Stack: **Express.js · Claude API · Google Calendar · Supabase**

---

## Estructura

```
src/
├── index.js                  # Entry point
├── config/
│   └── supabase.js           # Cliente Supabase + schema SQL
├── routes/
│   ├── chat.js               # POST /api/chat
│   ├── appointments.js       # GET/PATCH /api/appointments
│   └── auth.js               # GET /auth/google (OAuth)
└── services/
    ├── claude.js             # Lógica de conversación + tool use
    └── calendar.js           # Google Calendar (slots, crear, cancelar)
```

---

## Setup

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Edita .env con tus credenciales
```

### 3. Crear tablas en Supabase
Copia el SQL del archivo `src/config/supabase.js` y ejecútalo en el SQL Editor de Supabase.

### 4. Conectar Google Calendar (una vez por clínica)
```bash
npm run dev
# Abre: http://localhost:3000/auth/google
# Autoriza la cuenta de Google de la clínica
# Guarda los tokens en Supabase o en el .env
```

### 5. Correr en desarrollo
```bash
npm run dev
```

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/chat` | Enviar mensaje al asistente |
| `GET` | `/api/chat/:id` | Historial de conversación |
| `GET` | `/api/appointments` | Listar citas (filtros: date, status, specialty) |
| `GET` | `/api/appointments/today` | Citas de hoy |
| `GET` | `/api/appointments/stats` | Métricas del mes |
| `PATCH` | `/api/appointments/:id` | Actualizar estado de cita |
| `GET` | `/auth/google` | Iniciar OAuth con Google |
| `GET` | `/health` | Health check |

---

## Ejemplo de uso

```bash
# Enviar mensaje al chatbot
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Quiero agendar una cita con medicina general",
    "patientPhone": "+52551234567"
  }'

# Respuesta:
# {
#   "reply": "Con gusto te ayudo. ¿Para qué fecha necesitas la cita?",
#   "conversationId": "uuid-..."
# }
```

---

## Siguiente paso: WhatsApp

Para conectar WhatsApp Business, agrega el webhook de Twilio o Meta que llame a `POST /api/chat` con el mensaje del paciente.

```js
// Ejemplo webhook Twilio
app.post('/webhook/twilio', (req, res) => {
  const { Body: message, From: patientPhone } = req.body
  // → llama a chat({ message, patientPhone })
})
```
