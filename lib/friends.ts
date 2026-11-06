import { supabase } from '@/lib/supabase'
import type { Friend, FriendRequest, UserSearchResult } from '@/types/friends'

// Les fonctions SQL renvoient du snake_case : on traduit ici, une fois pour
// toutes, pour que le reste de l'app ne voie que du camelCase.

export async function searchUsers(query: string, signal?: AbortSignal): Promise<UserSearchResult[]> {
  // search_users() ne renvoie rien en dessous de 2 caractères, mais autant
  // éviter l'aller-retour réseau.
  if (query.trim().length < 2) return []

  const request = supabase.rpc('search_users', { p_query: query.trim() })
  const { data, error } = await (signal ? request.abortSignal(signal) : request)

  if (error) throw new Error(error.message)

  return (data ?? []).map((row: any) => ({
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url,
    relation: row.relation,
  }))
}

export async function getFriends(signal?: AbortSignal): Promise<Friend[]> {
  const request = supabase.rpc('my_friends')
  const { data, error } = await (signal ? request.abortSignal(signal) : request)

  if (error) throw new Error(error.message)

  return (data ?? []).map((row: any) => ({
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url,
    friendsSince: row.friends_since,
  }))
}

export async function getFriendRequests(signal?: AbortSignal): Promise<FriendRequest[]> {
  const request = supabase.rpc('my_friend_requests')
  const { data, error } = await (signal ? request.abortSignal(signal) : request)

  if (error) throw new Error(error.message)

  return (data ?? []).map((row: any) => ({
    direction: row.direction,
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  }))
}

// On n'envoie QUE le destinataire : requester_id vaut auth.uid() par défaut
// côté base, et l'app n'a même pas le droit d'écrire cette colonne.
export async function sendFriendRequest(userId: string) {
  const { error } = await supabase.from('friendship').insert({ addressee_id: userId })
  if (error) throw new Error(friendshipErrorMessage(error.code, error.message))
}

// La RLS ne laisse accepter que les lignes où je suis le destinataire et où le
// statut est 'pending' : inutile de préciser mon propre identifiant.
export async function acceptFriendRequest(requesterId: string) {
  const { error } = await supabase
    .from('friendship')
    .update({ status: 'accepted' })
    .eq('requester_id', requesterId)

  if (error) throw new Error(friendshipErrorMessage(error.code, error.message))
}

// Refuser une demande reçue = supprimer la ligne. La personne pourra
// redemander plus tard ; pour l'empêcher, il y a le blocage.
export async function declineFriendRequest(requesterId: string) {
  const { error } = await supabase.from('friendship').delete().eq('requester_id', requesterId)
  if (error) throw new Error(error.message)
}

// Annuler MA demande encore en attente
export async function cancelFriendRequest(addresseeId: string) {
  const { error } = await supabase.from('friendship').delete().eq('addressee_id', addresseeId)
  if (error) throw new Error(error.message)
}

// Retirer un ami : la ligne peut être dans un sens ou dans l'autre selon qui
// avait demandé. La RLS garantit qu'on ne touche que ses propres relations.
export async function removeFriend(userId: string) {
  const { error } = await supabase
    .from('friendship')
    .delete()
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)

  if (error) throw new Error(error.message)
}

// Traduit les erreurs techniques de Postgres en phrases affichables
function friendshipErrorMessage(code: string | undefined, message: string) {
  // Levée par le trigger friendship_guard (étape 10)
  if (message.includes('friendship_reverse_exists')) {
    return 'Cette personne t’a déjà envoyé une demande : accepte-la plutôt.'
  }
  // 23505 = violation d'unicité → la ligne (moi → cette personne) existe déjà
  if (code === '23505') return 'Demande déjà envoyée.'
  // 42501 = refus de la RLS
  if (code === '42501') return 'Action impossible (personne bloquée ?).'
  return message
}
