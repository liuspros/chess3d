// Visual recipes for every boards / piece set in data/catalog.js.
// tex = { kind, opts } handed to the procedural generators; mat = three.js material props.

const M = (base, vein, strength = 0.8, scale = 1) => ({ kind: 'marble', opts: { base, vein, strength, scale } })
const W = (light, dark, o = {}) => ({ kind: 'wood', opts: { light, dark, rings: 22, stretch: 0.06, pores: 0.12, ...o } })

export const BOARD_THEMES = {
  board_classic: {
    light: M([243, 239, 230], [98, 102, 110], 0.85),
    dark: W([150, 108, 72], [96, 62, 40], { rings: 26, stretch: 0.05, pores: 0.14, patch: 0.08 }),
    frame: W([104, 66, 42], [40, 22, 14]),
    lightMat: { roughness: 0.26, clearcoat: 0.85 }, darkMat: { roughness: 0.42, clearcoat: 0.45 }, frameMat: { roughness: 0.36 },
    trim: '#c9a45c',
  },
  board_onyx: {
    light: M([246, 244, 238], [140, 140, 148], 0.6),
    dark: M([20, 20, 24], [212, 175, 98], 0.9, 1.2),
    frame: M([26, 24, 28], [190, 156, 86], 0.8),
    lightMat: { roughness: 0.14, clearcoat: 1 }, darkMat: { roughness: 0.1, clearcoat: 1 }, frameMat: { roughness: 0.18 },
    trim: '#d9b66a',
  },
  board_jade: {
    light: M([206, 224, 208], [120, 164, 134], 0.55, 1.1),
    dark: M([22, 66, 50], [118, 172, 140], 0.65, 1.2),
    frame: W([60, 46, 30], [24, 16, 10]),
    lightMat: { roughness: 0.18, clearcoat: 0.9 }, darkMat: { roughness: 0.14, clearcoat: 1 }, frameMat: { roughness: 0.34 },
    trim: '#d6c27a',
  },
  board_burl: {
    light: W([226, 184, 120], [176, 128, 72], { rings: 14, stretch: 0.08, patch: 0.15 }),
    dark: W([112, 66, 38], [46, 24, 14], { rings: 9, stretch: 0.2, patch: 0.5, pores: 0.2 }),
    frame: W([70, 42, 26], [26, 14, 9], { rings: 12, patch: 0.3 }),
    lightMat: { roughness: 0.34, clearcoat: 0.6 }, darkMat: { roughness: 0.34, clearcoat: 0.7 }, frameMat: { roughness: 0.34 },
    trim: '#b88a44',
  },
  board_adire: {
    light: { kind: 'adire', opts: { invert: true, spots: 3 } },
    dark: { kind: 'adire', opts: { spots: 3 } },
    frame: W([60, 40, 26], [22, 14, 9]),
    lightMat: { roughness: 0.78, clearcoat: 0 }, darkMat: { roughness: 0.8, clearcoat: 0 }, frameMat: { roughness: 0.4 },
    trim: '#e8dcc0', bump: 0.7,
  },
  board_gold: {
    light: { kind: 'metal', opts: { base: [212, 172, 88], hi: [255, 226, 150], lo: [140, 104, 44], brushed: 0.5, mottle: 0.5 } },
    dark: M([14, 16, 34], [90, 100, 160], 0.55, 1.2),
    frame: { kind: 'metal', opts: { base: [170, 132, 60], hi: [230, 196, 110], lo: [90, 64, 26], brushed: 0.8 } },
    lightMat: { roughness: 0.3, metalness: 0.9, clearcoat: 0.4 }, darkMat: { roughness: 0.1, clearcoat: 1 }, frameMat: { roughness: 0.34, metalness: 0.85 },
    trim: '#f2d98a',
  },
}

const stone = (base, vein, strength, scale = 1.3) => ({ kind: 'marble', opts: { base, vein, strength, scale } })

export const PIECE_THEMES = {
  set_classic: {
    style: 'staunton',
    white: stone([250, 247, 240], [158, 152, 146], 0.55),
    black: W([62, 42, 30], [7, 5, 4], { rings: 30, stretch: 0.05 }),
    whiteMat: { roughness: 0.2, clearcoat: 0.8 }, blackMat: { roughness: 0.26, clearcoat: 0.9 },
  },
  set_modern: {
    style: 'modern',
    white: stone([232, 230, 224], [190, 188, 182], 0.2),
    black: { kind: 'metal', opts: { base: [52, 54, 60], hi: [84, 86, 94], lo: [30, 31, 36], brushed: 0.7, mottle: 0.2 } },
    whiteMat: { roughness: 0.55, clearcoat: 0.2 }, blackMat: { roughness: 0.4, metalness: 0.6 },
  },
  set_obsidian: {
    style: 'staunton',
    white: stone([240, 228, 204], [200, 180, 140], 0.4),
    black: stone([14, 14, 18], [70, 74, 96], 0.5),
    whiteMat: { roughness: 0.24, clearcoat: 0.7 }, blackMat: { roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 },
  },
  set_jade: {
    style: 'staunton',
    white: stone([246, 244, 236], [210, 206, 196], 0.35),
    black: stone([22, 74, 54], [120, 176, 142], 0.6),
    whiteMat: { roughness: 0.12, clearcoat: 1 }, blackMat: { roughness: 0.1, clearcoat: 1 },
  },
  set_bronze: {
    style: 'staunton',
    white: { kind: 'metal', opts: { base: [196, 128, 70], hi: [234, 176, 108], lo: [120, 70, 34], brushed: 0.25, mottle: 0.7, seed: 8 } },
    black: { kind: 'metal', opts: { base: [58, 44, 34], hi: [92, 112, 92], lo: [22, 17, 13], brushed: 0.2, mottle: 0.85, seed: 12 } },
    whiteMat: { roughness: 0.34, metalness: 0.85 }, blackMat: { roughness: 0.42, metalness: 0.7 },
  },
  set_glass: {
    style: 'staunton',
    white: stone([232, 244, 250], [200, 222, 236], 0.3),
    black: stone([36, 40, 52], [96, 108, 140], 0.4),
    whiteMat: { roughness: 0.08, clearcoat: 1, transmission: 0.5, thickness: 0.6, ior: 1.45 }, blackMat: { roughness: 0.06, clearcoat: 1, transmission: 0.35, thickness: 0.6, ior: 1.45 },
  },
  set_gold: {
    style: 'staunton',
    white: { kind: 'metal', opts: { base: [214, 176, 92], hi: [255, 230, 160], lo: [150, 112, 48], brushed: 0.2, mottle: 0.45, seed: 31 } },
    black: { kind: 'metal', opts: { base: [190, 194, 202], hi: [246, 248, 252], lo: [110, 114, 124], brushed: 0.2, mottle: 0.45, seed: 37 } },
    whiteMat: { roughness: 0.22, metalness: 1 }, blackMat: { roughness: 0.2, metalness: 1 },
  },
}
