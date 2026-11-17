// light-touch filter for in-game chat: masks a small list of common insults, keeps the rest untouched
const BAD = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'idiot', 'stupid', 'mumu', 'fool', 'dick', 'pussy', 'nigga', 'nigger', 'cunt']
const re = new RegExp(`(${BAD.join('|')})`, 'gi')
export const cleanText = (t) => String(t || '').replace(re, (m) => m[0] + '*'.repeat(m.length - 1))
