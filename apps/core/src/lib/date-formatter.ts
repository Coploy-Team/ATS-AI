/**
 * Utilitários para formatação de datas com timezone correto do Brasil
 * e conversões de Timestamp do Firebase
 */

/** Shape agnóstico de Timestamp (Firestore, MongoDB, etc.) */
type TimestampLike = { toDate: () => Date }

/**
 * Formata uma data para o timezone de São Paulo/Brasil
 * @param date Date object ou timestamp (em milissegundos)
 * @returns String formatada no padrão brasileiro com timezone correto
 */
export function formatToBrazilianTime(date: Date | number): string {
  const dateObj = date instanceof Date ? date : new Date(date)

  return dateObj.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Formata um timestamp Unix para o timezone de São Paulo/Brasil
 * @param timestamp Timestamp Unix (em segundos)
 * @returns String formatada no padrão brasileiro com timezone correto
 */
export function formatUnixTimestampToBrazilianTime(timestamp: number): string {
  return formatToBrazilianTime(new Date(timestamp * 1000))
}

/**
 * Formata uma data apenas com data (sem hora) para o timezone do Brasil
 * @param date Date object ou timestamp (em milissegundos)
 * @returns String formatada apenas com data (DD/MM/AAAA)
 */
export function formatDateOnlyToBrazilian(date: Date | number): string {
  const dateObj = date instanceof Date ? date : new Date(date)

  return dateObj.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Converte um Timestamp do Firebase para Date
 * Lida com casos onde o valor pode ser null/undefined
 * @param timestamp Timestamp do Firebase ou null/undefined
 * @returns Date object ou null
 */
export function timestampToDate(
  timestamp: TimestampLike | null | undefined
): Date | null {
  if (!timestamp) {
    return null
  }
  return timestamp.toDate()
}

/**
 * Converte um Timestamp do Firebase para Date com fallback
 * @param timestamp Timestamp do Firebase ou null/undefined
 * @param fallback Data de fallback (padrão: new Date())
 * @returns Date object (nunca null)
 */
export function timestampToDateWithFallback(
  timestamp: TimestampLike | null | undefined,
  fallback: Date = new Date()
): Date {
  if (!timestamp) {
    return fallback
  }
  return timestamp.toDate()
}

/**
 * Converte um valor que pode ser Date ou Timestamp para Date
 * Útil quando não temos certeza do tipo de entrada
 * @param value Date, Timestamp, ou null/undefined
 * @returns Date object ou null
 */
export function ensureDate(
  value: Date | TimestampLike | null | undefined
): Date | null {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value
  }
  // Assumir que é Timestamp
  return value.toDate()
}

/**
 * Converte qualquer valor de data para Date (Firestore Timestamp, MongoDB Date, número em ms).
 * Agnóstico de infra: funciona com Firestore e MongoDB.
 */
export function toDate(value: unknown): Date | null {
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'object' && value !== null && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  if (typeof value === 'object' && value !== null && 'seconds' in (value as Record<string, unknown>)) {
    const sec = (value as { seconds: number }).seconds
    return new Date(sec * 1000)
  }
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * Converte um valor que pode ser Date ou Timestamp para Date com fallback
 * @param value Date, Timestamp, ou null/undefined
 * @param fallback Data de fallback (padrão: new Date())
 * @returns Date object (nunca null)
 */
export function ensureDateWithFallback(
  value: Date | TimestampLike | null | undefined,
  fallback: Date = new Date()
): Date {
  try {
    const date = ensureDate(value)
    return date || fallback
  } catch {
    return fallback
  }
}

type MaybeDate = string | Date | null | undefined

function toDateSafe(d: MaybeDate): Date | null {
  if (!d) return null
  const dt = d instanceof Date ? d : new Date(d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function isPastDate(d: MaybeDate, nowMs = Date.now()): boolean {
  const dt = toDateSafe(d)
  return !!(dt && dt.getTime() <= nowMs)
}

const SP_TZ = 'America/Sao_Paulo'

/** Retorna y/m/d (calendar) na timezone de São Paulo para o instante dado. */
export function spParts(d: Date = new Date()): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(d)
  const get = (type: string) =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** Constrói um Date que corresponde a SP-local y-m-d 00:00:00. Iterativo p/ lidar com DST. */
function spDateFromYmd(year: number, month: number, day: number): Date {
  // Aproximação inicial: meio-dia UTC do mesmo Y-M-D — depois ajustamos pra meia-noite SP.
  let d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  for (let i = 0; i < 3; i++) {
    const p = spParts(d)
    if (p.year === year && p.month === month && p.day === day) {
      // OK, agora ajustar pra 00:00 SP
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: SP_TZ,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      const parts = fmt.formatToParts(d)
      const h = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
      const m = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
      const s = Number.parseInt(parts.find((p) => p.type === 'second')?.value ?? '0', 10)
      const offsetMs = (h * 3600 + m * 60 + s) * 1000
      return new Date(d.getTime() - offsetMs)
    }
    // Se SP renderiza outro dia, ajusta um dia pra direção certa.
    const target = year * 10000 + month * 100 + day
    const got = p.year * 10000 + p.month * 100 + p.day
    d = new Date(d.getTime() + (target > got ? 86_400_000 : -86_400_000))
  }
  return d
}

/** Início do mês corrente em SP, expresso como Date UTC. */
export function startOfMonthSP(now: Date = new Date()): Date {
  const { year, month } = spParts(now)
  return spDateFromYmd(year, month, 1)
}

/** Início do dia em SP, `daysAgo` dias atrás. `daysAgo=0` retorna início de hoje em SP. */
export function startOfDayAgoSP(daysAgo: number, now: Date = new Date()): Date {
  const today = startOfDayTodaySP(now)
  return new Date(today.getTime() - daysAgo * 86_400_000)
}

/** Início do dia de hoje em SP. */
export function startOfDayTodaySP(now: Date = new Date()): Date {
  const { year, month, day } = spParts(now)
  return spDateFromYmd(year, month, day)
}

/** Chave YYYY-MM-DD do calendário SP para um Date. */
export function spDateKey(d: Date): string {
  const { year, month, day } = spParts(d)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
