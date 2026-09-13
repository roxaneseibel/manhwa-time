// Mêmes règles que la contrainte SQL "profile_username_format" (supabase/sql/03_username_rules.sql).
// Si tu changes l'une, change l'autre.
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/

export const USERNAME_RULES = '3 à 20 caractères : lettres (sans accent), chiffres ou _'
