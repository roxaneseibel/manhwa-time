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
