import { StyleSheet, Text, View } from 'react-native'

export default function LibraryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ma liste</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
})
