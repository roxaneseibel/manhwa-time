import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

const supabaseUrl = "https://dhcxtooelukyrwybysfi.supabase.co";
const supabaseAnonKey = "sb_publishable_CDfB8T7CIL1s-b770sP8HQ_IEaXT6eB";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,       // où garder la session sur le téléphone
    autoRefreshToken: true,      // renouveler le jeton avant qu'il expire
    persistSession: true,        // rester connecté après fermeture de l'app
    detectSessionInUrl: false,   // utile seulement dans un navigateur web
  },
});

// Sur mobile, l'app peut passer en arrière-plan pendant des heures.
// On ne rafraîchit la session que lorsque l'app est au premier plan.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
