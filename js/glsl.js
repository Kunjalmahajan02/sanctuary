// GLSL shared by the sky and the interiors. Expects uSize (painting size in
// pixels), uUpscale (screen pixels per painting pixel) and uSharp to be declared.

export const NOISE_AND_SAMPLING = `float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++){ v += a*noise(p); p = r*p*2.03 + 17.1; a *= 0.5; }
  return v/0.875;
}
float fbm2(vec2 p){ return (noise(p)*0.67 + noise(p*2.03 + 17.1)*0.33); }

// Catmull-Rom in 9 bilinear taps, plus a gentle detail lift, so the painting
// stays crisp when it is drawn larger than its native size
vec3 sharpTex(sampler2D tex, vec2 uv){
  if (uUpscale < 1.02) return texture(tex, uv).rgb;
  vec2 sp = uv*uSize;
  vec2 t1 = floor(sp - 0.5) + 0.5;
  vec2 f = sp - t1;
  vec2 w0 = f*(-0.5 + f*(1.0 - 0.5*f));
  vec2 w1 = 1.0 + f*f*(-2.5 + 1.5*f);
  vec2 w2 = f*(0.5 + f*(2.0 - 1.5*f));
  vec2 w3 = f*f*(-0.5 + 0.5*f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (t1 - 1.0)/uSize, t3 = (t1 + 2.0)/uSize, t12 = (t1 + w2/w12)/uSize;
  vec3 c = vec3(0.0);
  c += texture(tex, vec2(t0.x, t0.y)).rgb*w0.x*w0.y;
  c += texture(tex, vec2(t12.x, t0.y)).rgb*w12.x*w0.y;
  c += texture(tex, vec2(t3.x, t0.y)).rgb*w3.x*w0.y;
  c += texture(tex, vec2(t0.x, t12.y)).rgb*w0.x*w12.y;
  c += texture(tex, vec2(t12.x, t12.y)).rgb*w12.x*w12.y;
  c += texture(tex, vec2(t3.x, t12.y)).rgb*w3.x*w12.y;
  c += texture(tex, vec2(t0.x, t3.y)).rgb*w0.x*w3.y;
  c += texture(tex, vec2(t12.x, t3.y)).rgb*w12.x*w3.y;
  c += texture(tex, vec2(t3.x, t3.y)).rgb*w3.x*w3.y;
  vec3 soft = textureLod(tex, uv, 1.25).rgb;
  return clamp(c + (c - soft)*uSharp, 0.0, 1.0);
}`;
