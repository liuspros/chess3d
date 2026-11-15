export const FILES = 'abcdefgh'
export const RANKS = '12345678'

// board square -> world position (square size 1, board centred on the origin)
export function squarePos(sq) {
  const f = FILES.indexOf(sq[0])
  const r = parseInt(sq[1], 10) - 1
  return [f - 3.5, 0, 3.5 - r]
}
