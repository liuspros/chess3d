import { woodDataURL } from '../three/textures.js'

// Generates wood-grain images with the same generator as the 3D board and exposes them
// as CSS variables, so every button and panel is real (procedural) wood.
export async function applyWoodTheme() {
  try {
    const [btn, hi, panel] = await Promise.all([
      woodDataURL({ seed: 301, light: [150, 100, 62], dark: [84, 52, 30], rings: 14, stretch: 0.05, pores: 0.14 }, 160),
      woodDataURL({ seed: 311, light: [196, 142, 88], dark: [118, 76, 40], rings: 12, stretch: 0.05, pores: 0.12 }, 160),
      woodDataURL({ seed: 321, light: [66, 44, 28], dark: [26, 17, 10], rings: 10, stretch: 0.06, pores: 0.1 }, 192),
    ])
    const s = document.documentElement.style
    s.setProperty('--wood-btn', `url(${btn})`)
    s.setProperty('--wood-btn-hi', `url(${hi})`)
    s.setProperty('--wood-panel', `url(${panel})`)
  } catch {
    /* gradients stay as the fallback */
  }
}
