import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

export const SERVER_TIMEZONE = 'Asia/Jakarta'

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

export const formatDateTime = (date: Date | null): string | null => {
  if (!date) return null
  // Prisma reads MySQL DATETIME as a UTC-based JS Date. When the DB stores
  // WIB clock values directly, the UTC getters preserve those raw stored parts.
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  )
}

export const formatDate = (date: Date | null): string | null => {
  if (!date) return null
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function toStoredWibDate(date = new Date()): Date {
  const wib = dayjs(date).tz(SERVER_TIMEZONE)
  return new Date(
    Date.UTC(
      wib.year(),
      wib.month(),
      wib.date(),
      wib.hour(),
      wib.minute(),
      wib.second(),
      wib.millisecond(),
    ),
  )
}

export function serializeDatesForJson<T>(value: T): T {
  if (value instanceof Date) {
    return formatDateTime(value) as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeDatesForJson(item)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        serializeDatesForJson(nestedValue),
      ]),
    ) as T
  }

  return value
}
