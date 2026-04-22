import { Router } from 'express'
import { supabase } from '../config/supabase.js'

const router = Router()

/**
 * @swagger
 * /api/appointments:
 *   get:
 *     summary: Listar citas
 *     description: Obtiene lista de citas con filtros opcionales
 *     tags:
 *       - Appointments
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filtrar por fecha (YYYY-MM-DD)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, completed, cancelled, no_show]
 *         description: Filtrar por estado
 *       - in: query
 *         name: specialty
 *         schema:
 *           type: string
 *         description: Filtrar por especialidad
 *     responses:
 *       200:
 *         description: Lista de citas
 *       500:
 *         description: Error al obtener citas
 */
router.get('/', async (req, res) => {
  try {
    const { date, status, specialty } = req.query

    let query = supabase
      .from('appointments')
      .select(`*, patients(name, phone, email)`)
      .order('date', { ascending: true })
      .order('time', { ascending: true })

    if (date) query = query.eq('date', date)
    if (status) query = query.eq('status', status)
    if (specialty) query = query.eq('specialty', specialty)

    const { data, error } = await query
    if (error) throw error

    res.json(data)
  } catch (err) {
    console.error('[appointments GET]', err)
    res.status(500).json({ error: 'Error al obtener citas.' })
  }
})

/**
 * @swagger
 * /api/appointments/today:
 *   get:
 *     summary: Citas de hoy
 *     description: Obtiene todas las citas programadas para hoy
 *     tags:
 *       - Appointments
 *     responses:
 *       200:
 *         description: Citas de hoy
 *       500:
 *         description: Error al obtener citas
 */
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('appointments')
      .select(`*, patients(name, phone)`)
      .eq('date', today)
      .eq('status', 'scheduled')
      .order('time')

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('[appointments today]', err.message)
    res.status(500).json({ error: 'Error al obtener citas de hoy.' })
  }
})

/**
 * @swagger
 * /api/appointments/{id}:
 *   patch:
 *     summary: Actualizar cita
 *     description: Actualiza el estado y/o notas de una cita
 *     tags:
 *       - Appointments
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la cita
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [scheduled, completed, cancelled, no_show]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cita actualizada
 *       400:
 *         description: Estado inválido
 *       500:
 *         description: Error al actualizar
 */
router.patch('/:id', async (req, res) => {
  try {
    const { status, notes } = req.body
    const { id } = req.params
    const validStatuses = ['scheduled', 'completed', 'cancelled', 'no_show']

    // Validaciones
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID de cita inválido.' })
    }

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Estado inválido. Usa: ${validStatuses.join(', ')}` })
    }

    if (notes && typeof notes !== 'string') {
      return res.status(400).json({ error: 'Las notas deben ser texto.' })
    }

    if (notes && notes.length > 1000) {
      return res.status(400).json({ error: 'Las notas son demasiado largas (máximo 1000 caracteres).' })
    }

    if (!status && !notes) {
      return res.status(400).json({ error: 'Debes proporcionar estado y/o notas para actualizar.' })
    }

    const updates = {}
    if (status) updates.status = status
    if (notes) updates.notes = notes

    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('[appointments PATCH]', err)
    res.status(500).json({ error: 'Error al actualizar la cita.' })
  }
})

/**
 * @swagger
 * /api/appointments/stats:
 *   get:
 *     summary: Estadísticas de citas
 *     description: Obtiene métricas de citas para el dashboard
 *     tags:
 *       - Appointments
 *     responses:
 *       200:
 *         description: Estadísticas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 today:
 *                   type: number
 *                 this_month:
 *                   type: number
 *                 cancelled_this_month:
 *                   type: number
 *       500:
 *         description: Error al obtener estadísticas
 */
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const thisMonth = today.slice(0, 7)

    const [todayRes, monthRes, cancelledRes] = await Promise.all([
      supabase.from('appointments').select('id', { count: 'exact' }).eq('date', today).eq('status', 'scheduled'),
      supabase.from('appointments').select('id', { count: 'exact' }).gte('date', `${thisMonth}-01`),
      supabase.from('appointments').select('id', { count: 'exact' }).gte('date', `${thisMonth}-01`).eq('status', 'cancelled'),
    ])

    res.json({
      today: todayRes.count || 0,
      this_month: monthRes.count || 0,
      cancelled_this_month: cancelledRes.count || 0,
    })
  } catch (err) {
    console.error('[appointments stats]', err.message)
    res.status(500).json({ error: 'Error al obtener estadísticas.' })
  }
})

export default router
