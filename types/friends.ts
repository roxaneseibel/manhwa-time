// L'état de ma relation avec quelqu'un, tel que le calcule search_users()
// (voir supabase/sql/10_friends.sql)
export type FriendRelation =
  | 'self' // c'est moi
  | 'friends' // déjà amis
  | 'sent' // je lui ai envoyé une demande, en attente
  | 'received' // il m'a envoyé une demande, à moi de répondre
  | 'none' // aucun lien

export type UserSearchResult = {
  id: string
  username: string
  avatarUrl: string | null
  relation: FriendRelation
}

export type Friend = {
  id: string
  username: string
  avatarUrl: string | null
  friendsSince: string | null
}

export type FriendRequest = {
  direction: 'incoming' | 'outgoing'
  id: string
  username: string
  avatarUrl: string | null
  createdAt: string
}
