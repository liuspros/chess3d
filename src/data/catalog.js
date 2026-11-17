// Shared by the game (shop UI) and the Vercel API (prices are re-checked on the server).
// Prices are in US cents; the checkout converts to the buyer's local currency.
// kind: 'board' | 'pieces' | 'bundle'. `free: true` items are always owned.

export const CATALOG = [
  // ---- boards ----
  { id: 'board_classic', kind: 'board', name: 'Classic Marble & Walnut', desc: 'The original: white marble and warm walnut.', free: true },
  { id: 'board_onyx', kind: 'board', name: 'Onyx & Carrara', desc: 'Polished black onyx against bright Carrara marble, gold veining.', usd: 299, tag: 'Popular' },
  { id: 'board_jade', kind: 'board', name: 'Emerald Jade', desc: 'Deep green jade and pale celadon stone, slightly translucent.', usd: 299 },
  { id: 'board_burl', kind: 'board', name: 'Burl & Maple', desc: 'Swirling burl walnut against honey maple. Warm and rich.', usd: 199 },
  { id: 'board_adire', kind: 'board', name: 'Adire Indigo', desc: 'Hand-dyed indigo and cream tiles inspired by Yoruba Adire cloth.', usd: 349, tag: 'Naija' },
  { id: 'board_gold', kind: 'board', name: 'Royal Gold Leaf', desc: 'Gold-leaf and midnight lacquer, for people who like to win in style.', usd: 499, tag: 'Premium' },

  // ---- piece sets ----
  { id: 'set_classic', kind: 'pieces', name: 'Classic Staunton', desc: 'White marble and ebony, turned from solid stone.', free: true },
  { id: 'set_modern', kind: 'pieces', name: 'Modern Minimal', desc: 'Clean, bold shapes. Matte stone and brushed graphite.', usd: 199 },
  { id: 'set_obsidian', kind: 'pieces', name: 'Obsidian & Ivory', desc: 'Glassy black obsidian against warm ivory.', usd: 249 },
  { id: 'set_jade', kind: 'pieces', name: 'Jade & Pearl', desc: 'Carved green jade against pearl white.', usd: 299 },
  { id: 'set_bronze', kind: 'pieces', name: 'Benin Bronze', desc: 'Warm cast bronze against dark patina, inspired by the Benin bronzes.', usd: 399, tag: 'Naija' },
  { id: 'set_glass', kind: 'pieces', name: 'Crystal', desc: 'Frosted and smoked glass with a soft inner glow.', usd: 349 },
  { id: 'set_gold', kind: 'pieces', name: 'Gold & Silver', desc: 'Polished 24k-look gold against bright silver.', usd: 499, tag: 'Premium' },

  // ---- bundles (price is less than buying the parts) ----
  { id: 'bundle_royal', kind: 'bundle', name: 'Royal Bundle', desc: 'Royal Gold Leaf board + Gold & Silver pieces.', usd: 749, includes: ['board_gold', 'set_gold'], tag: 'Save 25%' },
  { id: 'bundle_heritage', kind: 'bundle', name: 'Heritage Bundle', desc: 'Adire Indigo board + Benin Bronze pieces.', usd: 599, includes: ['board_adire', 'set_bronze'], tag: 'Save 20%' },
  { id: 'bundle_all', kind: 'bundle', name: 'Collector’s Pack', desc: 'Every board and every piece set, now and for new ones added later this year.', usd: 1999, includes: ['board_onyx', 'board_jade', 'board_burl', 'board_adire', 'board_gold', 'set_modern', 'set_obsidian', 'set_jade', 'set_bronze', 'set_glass', 'set_gold'], tag: 'Best value' },
]

export const BY_ID = Object.fromEntries(CATALOG.map((i) => [i.id, i]))
export const FREE_IDS = CATALOG.filter((i) => i.free).map((i) => i.id)

// all item ids a purchase unlocks (bundles expand)
export function expand(ids) {
  const out = new Set()
  for (const id of ids) {
    const it = BY_ID[id]
    if (!it || it.free) continue
    if (it.kind === 'bundle') it.includes.forEach((x) => out.add(x))
    else out.add(id)
  }
  return [...out]
}

// total price in USD cents for what a person is buying (unique ids only)
export function priceCents(ids) {
  return [...new Set(ids)].reduce((s, id) => s + (BY_ID[id]?.usd || 0), 0)
}

export const usd = (cents) => `$${(cents / 100).toFixed(2)}`
