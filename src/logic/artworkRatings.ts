const KEY = 'pokevalue-artwork-ratings-v1'

export type Ratings = Record<string, number>

export function loadRatings(): Ratings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveRatings(ratings: Ratings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ratings))
  } catch {
    // localStorage unavailable — ratings only last for this session
  }
}
