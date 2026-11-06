import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { SearchBar } from '@/components/SearchBar'
import { UserRow } from '@/components/UserRow'
import { useAsync } from '@/hooks/useAsync'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatRelativeDate } from '@/lib/dates'
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  getFriendRequests,
  getFriends,
  removeFriend,
  searchUsers,
  sendFriendRequest,
} from '@/lib/friends'
import type { FriendRelation } from '@/types/friends'

export default function FriendsScreen() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 350)
  const isSearching = debouncedQuery.trim().length >= 2

  // Un seul compteur recharge TOUT (amis, demandes, et la recherche en cours) :
  // après une action, l'état des boutons doit changer partout à la fois.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  const search = useAsync(
    (signal) => (isSearching ? searchUsers(debouncedQuery, signal) : Promise.resolve([])),
    [debouncedQuery, isSearching, reloadKey],
  )
  const friends = useAsync((signal) => getFriends(signal), [reloadKey])
  const requests = useAsync((signal) => getFriendRequests(signal), [reloadKey])

  // Enveloppe commune : bloque le bouton pendant l'appel, affiche l'erreur,
  // recharge ensuite. Évite de répéter ce try/catch dans chaque bouton.
  async function run(userId: string, action: () => Promise<void>) {
    setBusyUserId(userId)
    try {
      await action()
      reload()
    } catch (e) {
      Alert.alert('Erreur', (e as Error).message)
    } finally {
      setBusyUserId(null)
    }
  }

  function confirmRemove(userId: string, username: string) {
    Alert.alert('Retirer cet ami ?', `${username} ne verra plus ton activité.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: () => run(userId, () => removeFriend(userId)),
      },
    ])
  }

  // ---------------------------------------------------------------------
  // Mode recherche
  // ---------------------------------------------------------------------
  if (isSearching) {
    return (
      <View style={styles.container}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Chercher un pseudo"
          autoCapitalize="none"
        />

        {search.loading && <ActivityIndicator style={styles.spacer} />}
        {!!search.error && <Text style={styles.error}>Erreur : {search.error}</Text>}

        <FlatList
          data={search.data ?? []}
          keyExtractor={(user) => user.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            search.loading ? null : (
              <Text style={styles.empty}>Aucun pseudo ne correspond à « {debouncedQuery} ».</Text>
            )
          }
          renderItem={({ item }) => (
            <UserRow
              username={item.username}
              avatarUrl={item.avatarUrl}
              right={
                <RelationButton
                  relation={item.relation}
                  busy={busyUserId === item.id}
                  onAdd={() => run(item.id, () => sendFriendRequest(item.id))}
                  onAccept={() => run(item.id, () => acceptFriendRequest(item.id))}
                  onCancel={() => run(item.id, () => cancelFriendRequest(item.id))}
                />
              }
            />
          )}
        />
      </View>
    )
  }

  // ---------------------------------------------------------------------
  // Mode normal : demandes reçues, demandes envoyées, puis mes amis
  // ---------------------------------------------------------------------
  const incoming = (requests.data ?? []).filter((r) => r.direction === 'incoming')
  const outgoing = (requests.data ?? []).filter((r) => r.direction === 'outgoing')
  const loading = friends.loading || requests.loading

  return (
    <View style={styles.container}>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Chercher un pseudo"
        autoCapitalize="none"
      />

      {loading && <ActivityIndicator style={styles.spacer} />}
      {!!(friends.error || requests.error) && (
        <Text style={styles.error}>Erreur : {friends.error ?? requests.error}</Text>
      )}

      <FlatList
        data={friends.data ?? []}
        keyExtractor={(friend) => friend.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {incoming.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Demandes reçues ({incoming.length})</Text>
                {incoming.map((request) => (
                  <UserRow
                    key={request.id}
                    username={request.username}
                    avatarUrl={request.avatarUrl}
                    subtitle={formatRelativeDate(request.createdAt)}
                    right={
                      busyUserId === request.id ? (
                        <ActivityIndicator />
                      ) : (
                        <View style={styles.actions}>
                          <SmallButton
                            label="Accepter"
                            primary
                            onPress={() =>
                              run(request.id, () => acceptFriendRequest(request.id))
                            }
                          />
                          <SmallButton
                            label="Refuser"
                            onPress={() =>
                              run(request.id, () => declineFriendRequest(request.id))
                            }
                          />
                        </View>
                      )
                    }
                  />
                ))}
              </View>
            )}

            {outgoing.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Demandes envoyées ({outgoing.length})</Text>
                {outgoing.map((request) => (
                  <UserRow
                    key={request.id}
                    username={request.username}
                    avatarUrl={request.avatarUrl}
                    subtitle="en attente de réponse"
                    right={
                      busyUserId === request.id ? (
                        <ActivityIndicator />
                      ) : (
                        <SmallButton
                          label="Annuler"
                          onPress={() => run(request.id, () => cancelFriendRequest(request.id))}
                        />
                      )
                    }
                  />
                ))}
              </View>
            )}

            {(friends.data ?? []).length > 0 && (
              <Text style={styles.sectionTitle}>
                Mes amis ({(friends.data ?? []).length})
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>
              Tu n’as pas encore d’amis ici.{'\n'}
              Cherche quelqu’un par son pseudo pour lui envoyer une demande.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <UserRow
            username={item.username}
            avatarUrl={item.avatarUrl}
            subtitle={item.friendsSince ? `amis depuis ${formatRelativeDate(item.friendsSince)}` : null}
            right={
              busyUserId === item.id ? (
                <ActivityIndicator />
              ) : (
                <SmallButton label="Retirer" onPress={() => confirmRemove(item.id, item.username)} />
              )
            }
          />
        )}
      />
    </View>
  )
}

// Le bouton de droite dans les résultats de recherche dépend entièrement de
// l'état de la relation, calculé par search_users() côté base.
function RelationButton({
  relation,
  busy,
  onAdd,
  onAccept,
  onCancel,
}: {
  relation: FriendRelation
  busy: boolean
  onAdd: () => void
  onAccept: () => void
  onCancel: () => void
}) {
  if (busy) return <ActivityIndicator />

  switch (relation) {
    case 'self':
      return <Text style={styles.muted}>toi</Text>
    case 'friends':
      return <Text style={styles.muted}>ami</Text>
    case 'sent':
      return <SmallButton label="Annuler" onPress={onCancel} />
    case 'received':
      return <SmallButton label="Accepter" primary onPress={onAccept} />
    default:
      return <SmallButton label="Ajouter" primary onPress={onAdd} />
  }
}

function SmallButton({
  label,
  onPress,
  primary = false,
}: {
  label: string
  onPress: () => void
  primary?: boolean
}) {
  return (
    <Pressable style={[styles.smallButton, primary && styles.smallButtonPrimary]} onPress={onPress}>
      <Text style={[styles.smallButtonText, primary && styles.smallButtonTextPrimary]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  spacer: { marginVertical: 8 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#636e72', marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 6 },
  smallButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  smallButtonPrimary: { backgroundColor: '#6C5CE7', borderColor: '#6C5CE7' },
  smallButtonText: { fontSize: 13, color: '#2d3436' },
  smallButtonTextPrimary: { color: '#fff', fontWeight: '600' },
  muted: { color: '#636e72', fontSize: 13 },
  empty: { color: '#636e72', textAlign: 'center', marginTop: 32, lineHeight: 20 },
  error: { color: '#d63031' },
})
