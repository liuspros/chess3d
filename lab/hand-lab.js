import * as THREE from 'three'
import { createHand } from '../src/three/hands/ChessHand.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const q = new URLSearchParams(location.search)
const W = +q.get('w') || 900, H = +q.get('h') || 700
const canvas = document.getElementById('c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.setSize(W, H); renderer.setPixelRatio(1)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2a1d13')
const pm = new THREE.PMREMGenerator(renderer)
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.5
scene.add(new THREE.HemisphereLight('#fff1dd', '#2a1a10', 0.3))
const dl = new THREE.DirectionalLight('#fff0d8', 2.6); dl.position.set(3, 9, 4); dl.castShadow = true; dl.shadow.mapSize.set(1024, 1024)
Object.assign(dl.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 }); scene.add(dl)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: '#7a5535', roughness: 0.7 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.6; floor.receiveShadow = true; scene.add(floor)

const t0 = performance.now()
const hand = createHand('#e9e3d4', '#f4efe3', q.get('q') || 'high')
window.__buildMs = Math.round(performance.now() - t0)
const g = new THREE.Group(); g.add(hand.root); scene.add(g)
if (q.get('mirror')) g.scale.x = -1
hand.setCurl(+q.get('curl') || 0.15, 0)
const cam = new THREE.PerspectiveCamera(+q.get('fov') || 30, W / H, 0.05, 100)
const view = q.get('view') || 'top'
const tgt = new THREE.Vector3(...(q.get('t') || '-0.1,0,0.6').split(',').map(Number))
const dist = +q.get('d') || 7
const views = { top: [0, 1, 0.001], palm: [0, -1, 0.001], side: [1, 0.15, 0], persp: [0.5, 0.8, -0.8], game: [0.3, 0.75, -0.6], front: [0, 0.2, 1] }
cam.position.copy(tgt).add(new THREE.Vector3(...views[view]).normalize().multiplyScalar(dist)); cam.lookAt(tgt)
window.__render = () => { renderer.render(scene, cam); return true }
window.__hand = hand; window.__THREE = THREE
requestAnimationFrame(() => { window.__render(); window.__ready = true })
