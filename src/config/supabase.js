import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

/*
========================================
  SCHEMA SQL — ejecutar en Supabase
========================================

-- Pacientes
create table patients (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  name text,
  email text,
  created_at timestamptz default now()
);

-- Citas
create table appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id),
  specialty text not null,
  doctor_name text,
  date date not null,
  time text not null,
  status text default 'scheduled',  -- scheduled | cancelled | completed
  google_event_id text,
  notes text,
  created_at timestamptz default now()
);

-- Historial de conversaciones
create table conversations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id),
  messages jsonb not null default '[]',
  channel text default 'web',        -- web | whatsapp
  last_activity timestamptz default now(),
  created_at timestamptz default now()
);

-- Índices útiles
create index on conversations (patient_id);
create index on appointments (patient_id, date);
*/
