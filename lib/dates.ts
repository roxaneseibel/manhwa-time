// "2026-09-09" → "09/09/2026"
export function formatDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

// "2026-09-09" → "il y a 4 jours"
export function formatRelativeDate(isoDate: string) {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000)

  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 30) return `il y a ${days} jours`
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`
  const years = Math.floor(days / 365)
  return `il y a ${years} an${years > 1 ? 's' : ''}`
}

// Horodatage complet → "à l'instant", "il y a 5 min", "il y a 3 h", puis comme formatRelativeDate
export function formatRelativeTime(isoDateTime: string) {
  const minutes = Math.floor((Date.now() - new Date(isoDateTime).getTime()) / 60_000)

  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  if (minutes < 24 * 60) return `il y a ${Math.floor(minutes / 60)} h`
  return formatRelativeDate(isoDateTime)
}
