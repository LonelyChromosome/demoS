#include <flutter/runtime_effect.glsl>
uniform vec2 uSize;
uniform float uProgress;
uniform sampler2D uTheme;
out vec4 fragColor;
float hash(vec2 p) {
  float n=mod(p.x*73.0+p.y*151.0,289.0);
  return mod(n*n*34.0+n,289.0)/289.0;
}
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void main() {
  vec2 uv=FlutterFragCoord().xy/uSize;
  float n=noise(uv*vec2(9,17))*.70+noise(uv*vec2(31,57))*.30;
  // Earliest threshold is the upper RIGHT corner, latest is lower left.
  float birth=(uv.y*.72+(1.0-uv.x)*.20+n*.08)*1.30;
  float keep=smoothstep(uProgress-.008,uProgress+.008,birth);
  fragColor=texture(uTheme,uv)*keep;
}
