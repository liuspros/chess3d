/* GLSL chunks injected into MeshPhysicalMaterial (so the hand keeps reacting to the
 * scene's own lights, shadows and environment). All skin detail is procedural and
 * evaluated in the hand's rest-pose space, so pores and creases stay glued to the
 * skin while the fingers bend. */

export const NOISE = /* glsl */ `
float h31(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z);
}
// distance from p to segment ab (2D)
float segd(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }
`

export const VERT_HEAD = /* glsl */ `
attribute vec3 aRest; attribute vec4 aTone; attribute vec2 aCrease; attribute float aAO;
varying vec3 vRest; varying vec4 vTone; varying vec2 vCrease; varying float vAO;
`
export const VERT_BODY = /* glsl */ `
#include <begin_vertex>
vRest = aRest; vTone = aTone; vCrease = aCrease; vAO = aAO;
`

export const FRAG_HEAD = /* glsl */ `
uniform vec3 uSkin; uniform float uBump; uniform float uSss;
varying vec3 vRest; varying vec4 vTone; varying vec2 vCrease; varying float vAO;
${NOISE}
`

// colour, micro relief and roughness – evaluated once per fragment
export const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
float sk_palm = clamp(vTone.z, 0.0, 1.0);
float sk_back = clamp(-vTone.z, 0.0, 1.0);
float sk_h = 0.0;
float sk_pore = 0.0;
float sk_crease = 0.0;
float sk_lod = 1.0;
{
  vec3 skin = uSkin;
  // palm: lighter and pinker; back of the hand: a touch darker and more yellow
  skin = mix(skin, skin * vec3(1.07, 0.9, 0.9) + vec3(0.02, 0.0, 0.0), sk_palm * 0.75);
  skin *= mix(1.0, 0.95, sk_back);
  // knuckle pigmentation and flush of the fingertips
  skin = mix(skin, skin * vec3(0.8, 0.6, 0.55), vTone.x * (0.25 + 0.6 * sk_back));
  skin = mix(skin, skin * vec3(1.1, 0.72, 0.7), vTone.y * 0.5);
  // slow mottling
  float m1 = vnoise(vRest * 5.0), m2 = vnoise(vRest * 17.0 + 4.0);
  skin *= 1.0 + ((m1 * 0.6 + m2 * 0.4) - 0.5) * 0.14;
  skin.gb *= 1.0 - (vnoise(vRest * 8.0 + 9.0) - 0.5) * 0.1;
  // faint veins on the back of the hand
  #if SKIN_Q > 1
    float vv = abs(vnoise(vRest * vec3(7.0, 7.0, 4.0) + 3.0) - 0.5);
    float vein = (1.0 - smoothstep(0.0, 0.03, vv)) * smoothstep(0.2, 0.8, sk_back) * (1.0 - vTone.x) * smoothstep(0.1, 0.5, vRest.z);
    skin = mix(skin, skin * vec3(0.8, 0.88, 0.96), vein * 0.5);
  #endif

  // fine relief: skin lines + pores (faded out by distance so it never shimmers)
  float px = length(fwidth(vRest));
  sk_lod = 1.0 - smoothstep(0.0022, 0.0065, px);
  float lineNet = 1.0 - smoothstep(0.0, 0.1, abs(vnoise(vRest * 62.0) - 0.5));
  float lineNet2 = 1.0 - smoothstep(0.0, 0.1, abs(vnoise(vRest * 41.0 + 7.0) - 0.5));
  sk_pore = smoothstep(0.8, 1.0, vnoise(vRest * 150.0));
  float mid = vnoise(vRest * 24.0);
  sk_h = (-0.42 * sk_pore - 0.1 * max(lineNet, lineNet2)) * sk_lod * mix(0.8, 1.2, sk_back) + (mid - 0.5) * 0.22;

  // creases over every joint (several fine lines on the back, bolder folds on the palm)
  float cu = vCrease.x;
  float env = vCrease.y * (1.0 - smoothstep(0.03, 0.065, abs(cu)));
  float warp = (vnoise(vRest * 30.0) - 0.5) * 0.012;
  float main = exp(-pow((cu + warp) / 0.0075, 2.0));
  float side = exp(-pow((abs(cu + warp) - 0.02) / 0.006, 2.0)) * 0.7;
  float fine = 0.5 + 0.5 * cos((cu + warp) * 520.0);
  sk_crease = env * (main * (0.4 + 0.6 * sk_palm) + side * sk_back * 0.3 + fine * 0.14 * sk_back * (1.0 - main));
  sk_crease = clamp(sk_crease, 0.0, 1.0);

  // palm lines (heart, head and life lines)
  #if SKIN_Q > 1
  if (sk_palm > 0.3) {
    vec2 q = vRest.xz;
    float d1 = min(segd(q, vec2(0.38, 0.62), vec2(0.15, 0.74)), min(segd(q, vec2(0.15, 0.74), vec2(-0.1, 0.78)), segd(q, vec2(-0.1, 0.78), vec2(-0.33, 0.74))));
    float d2 = min(segd(q, vec2(-0.37, 0.62), vec2(-0.1, 0.55)), min(segd(q, vec2(-0.1, 0.55), vec2(0.15, 0.46)), segd(q, vec2(0.15, 0.46), vec2(0.3, 0.42))));
    float d3 = min(segd(q, vec2(-0.37, 0.62), vec2(-0.3, 0.38)), min(segd(q, vec2(-0.3, 0.38), vec2(-0.2, 0.2)), segd(q, vec2(-0.2, 0.2), vec2(-0.12, 0.04))));
    float pl = exp(-pow(min(d1, min(d2, d3)) / (0.009 + 0.006 * vnoise(vRest * 14.0)), 2.0));
    sk_crease = max(sk_crease, pl * 0.38 * smoothstep(0.3, 0.7, sk_palm));
  }
  #endif

  skin *= 1.0 - sk_crease * 0.24;
  skin *= 1.0 - sk_pore * sk_lod * 0.09;
  skin = mix(skin, skin * vec3(1.05, 0.8, 0.78), sk_crease * 0.4);
  skin *= mix(1.0, vAO, 0.85);
  diffuseColor.rgb = skin;
}
`

export const FRAG_ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + sk_pore * sk_lod * 0.18 + sk_crease * 0.12 + vTone.x * 0.05 - sk_palm * 0.04, 0.3, 0.9);
`

// bump mapping from derivatives: no tangents or UVs needed
export const FRAG_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
{
  float h = (sk_h - sk_crease * 1.1) * uBump;
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  normal = normalize(abs(det) * normal - g);
}
`

// skin translucency: light bleeding past the terminator, back-light through thin parts, warm rim
export const FRAG_SSS = /* glsl */ `
#include <lights_fragment_end>
{
  vec3 V = normalize(vViewPosition);
  float thin = 1.0 - vTone.w;
  vec3 sss = vec3(1.0, 0.38, 0.26) * diffuseColor.rgb * uSss;
  #if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    vec3 L = directionalLights[i].direction;
    float nl = dot(normal, L);
    float wrap = clamp((nl + 0.5) / 1.5, 0.0, 1.0) - clamp(nl, 0.0, 1.0);
    float back = pow(clamp(dot(V, -(L + normal * 0.35)), 0.0, 1.0), 3.0);
    reflectedLight.directDiffuse += directionalLights[i].color * sss * (wrap * 0.35 + back * thin * 0.7) * RECIPROCAL_PI;
  }
  #endif
  reflectedLight.directDiffuse *= mix(1.0, vAO, 0.55);
  float ndv = clamp(dot(normal, V), 0.0, 1.0);
  totalEmissiveRadiance += sss * pow(1.0 - ndv, 3.0) * (0.04 + 0.08 * thin);
}
`

export const FRAG_AO = /* glsl */ `
#include <aomap_fragment>
reflectedLight.indirectDiffuse *= mix(1.0, vAO, 0.9);
reflectedLight.indirectSpecular *= mix(1.0, vAO, 0.75);
`
