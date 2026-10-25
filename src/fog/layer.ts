import {Layer, project32} from '@deck.gl/core';
import type {DefaultProps, LayerProps, UpdateParameters} from '@deck.gl/core';
import {Buffer} from '@luma.gl/core';
import {Model} from '@luma.gl/engine';
import type {ShaderModule} from '@luma.gl/shadertools';
import type {FogMesh} from './grid';

type RGB = [number, number, number];

export interface FogLayerUniforms {
  mode: number;
  noiseScale: number;
  paper: RGB;
  edge: RGB;
  colorA: RGB;
  colorB: RGB;
  colorBoth: RGB;
  highlight: RGB;
}

const uniformBlock = /* glsl */ `\
layout(std140) uniform fogUniforms {
  float mode;
  float noiseScale;
  vec3 paper;
  vec3 edge;
  vec3 colorA;
  vec3 colorB;
  vec3 colorBoth;
  vec3 highlight;
} fog;
`;

const fogUniforms = {
  name: 'fog',
  vs: uniformBlock,
  fs: uniformBlock,
  uniformTypes: {
    mode: 'f32',
    noiseScale: 'f32',
    paper: 'vec3<f32>',
    edge: 'vec3<f32>',
    colorA: 'vec3<f32>',
    colorB: 'vec3<f32>',
    colorBoth: 'vec3<f32>',
    highlight: 'vec3<f32>',
  },
} as const satisfies ShaderModule<FogLayerUniforms>;

const vs = /* glsl */ `\
#version 300 es
#define SHADER_NAME fog-layer-vertex-shader

in vec2 positions;
in vec4 fogValues;
in vec4 fogEdges;

out vec4 vFog;
out vec2 vEdge;
out vec3 vSphere;
out float vFacing;
out float vHatch;
out float vGlobe;

void main(void) {
  vec3 pos = vec3(positions, 0.0);
  geometry.worldPosition = pos;
  gl_Position = project_position_to_clipspace(pos, vec3(0.0), vec3(0.0), geometry.position);
  vFog = fogValues;
  vEdge = fogEdges.xy;
  // Pencil hatching fixed to the map: diagonal lines in screen pixels at the current zoom.
  vHatch = (geometry.position.x - geometry.position.y) * project.scale;
  // Noise lives on the unit sphere so it is seamless across the antimeridian and on the globe.
  float lat = radians(positions.y);
  float lng = radians(positions.x);
  vSphere = vec3(cos(lat) * cos(lng), cos(lat) * sin(lng), sin(lat));
  vFacing = 1.0;
  vGlobe = 0.0;
  if (project.projectionMode == PROJECTION_MODE_GLOBE) {
    vec3 p = geometry.position.xyz;
    vFacing = dot(normalize(p), project.cameraPosition - p);
    vGlobe = 1.0;
  }
}
`;

const fs = /* glsl */ `\
#version 300 es
#define SHADER_NAME fog-layer-fragment-shader
precision highp float;

in vec4 vFog;
in vec2 vEdge;
in vec3 vSphere;
in float vFacing;
in float vHatch;
in float vGlobe;
out vec4 fragColor;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z);
}

float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec3(17.1, 9.2, 3.7);
    a *= 0.5;
  }
  return s / 0.97;
}

// Frontiers are cloudy: noise pushes the fog in and out most where it is half-lifted,
// and more where the dates are uncertain.
float cloud(float a, float n, float u) {
  float spread = mix(0.9, 2.2, u);
  float t = a + (n - 0.5) * spread * (a * (1.0 - a) * 2.4 + 0.035);
  return clamp(t, 0.0, 1.0);
}

vec4 over(vec4 src, vec4 dst) {
  float a = src.a + dst.a * (1.0 - src.a);
  vec3 c = (src.rgb * src.a + dst.rgb * dst.a * (1.0 - src.a)) / max(a, 1e-4);
  return vec4(c, a);
}

void main(void) {
  if (vFacing < 0.0) discard;
  float n = fbm(vSphere * fog.noiseScale);
  float grain = fbm(vSphere * fog.noiseScale * 4.3 + 11.0);
  vec3 paper = fog.paper * (0.972 + 0.05 * grain);

  float fa = cloud(vFog.x, n, vFog.z);
  // What the traveller has seen: the fog parts along the route even before the news reaches home.
  float seen = vEdge.y;
  float homeFog = fa;
  fa = mix(fa, min(fa, 0.07 + 0.08 * n), smoothstep(0.0, 0.9, seen));
  // A warm tide line along frontiers only: strongest where the fog changes most between cells,
  // and only in the thinning part of the fog, so evenly fogged country stays clean.
  float frontier = smoothstep(0.08, 0.5, vEdge.x);
  float rimA = frontier * smoothstep(0.06, 0.3, fa) * (1.0 - smoothstep(0.35, 0.8, fa));
  vec4 col;
  if (fog.mode < 0.5) {
    col = vec4(mix(paper, fog.edge, rimA * 0.6), fa);
  } else {
    float fb = cloud(vFog.y, n, vFog.z);
    float rimB = frontier * smoothstep(0.06, 0.3, fb) * (1.0 - smoothstep(0.35, 0.8, fb));
    float ka = 1.0 - fa;
    float kb = 1.0 - fb;
    float onlyA = ka * (1.0 - kb);
    float onlyB = kb * (1.0 - ka);
    float both = ka * kb;
    float w = onlyA + onlyB + both;
    vec3 tint = (fog.colorA * onlyA + fog.colorB * onlyB + fog.colorBoth * both) / max(w, 1e-4);
    vec4 tintLayer = vec4(tint, w * 0.34);
    float unknown = fa * fb;
    vec4 fogLayer = vec4(mix(paper, fog.edge, max(rimA * fb, rimB * fa) * 0.6), unknown);
    col = over(fogLayer, tintLayer);
  }

  // Where only the traveller knows, the corridor is washed and pencil-hatched in the journey's colour.
  float provisional = smoothstep(0.05, 0.6, seen) * smoothstep(0.06, 0.32, homeFog);
  if (provisional > 0.002) {
    col = over(vec4(fog.colorA, provisional * 0.1), col);
    float hx = vGlobe > 0.5 ? (gl_FragCoord.x - gl_FragCoord.y) : vHatch;
    float t = abs(fract(hx / 9.0) - 0.5) * 9.0;
    float hatchLine = 1.0 - smoothstep(0.3, 1.0, t);
    col = over(vec4(fog.colorA, provisional * hatchLine * 0.2), col);
  }

  float h = vFog.w;
  if (h > 0.002) {
    float inside = smoothstep(0.35, 0.65, h);
    col = over(vec4(fog.highlight, inside * 0.09), col);
    float d = abs(h - 0.5) / max(fwidth(h), 1e-5);
    float line = 1.0 - smoothstep(0.4, 1.4, d);
    col = over(vec4(fog.highlight, line * 0.75), col);
  }
  fragColor = vec4(col.rgb, col.a * layer.opacity);
}
`;

export type FogLayerProps = LayerProps & {
  mesh: FogMesh;
  values: Uint8Array;
  edges: Uint8Array;
  version: number;
  uniforms: FogLayerUniforms;
};

const defaultProps: DefaultProps<FogLayerProps> = {
  mesh: {type: 'object', value: null as unknown as FogMesh, compare: false},
  values: {type: 'object', value: null as unknown as Uint8Array, compare: false},
  edges: {type: 'object', value: null as unknown as Uint8Array, compare: false},
  version: 0,
  uniforms: {type: 'object', value: null as unknown as FogLayerUniforms, compare: true},
};

/** Draws the fog of the unknown as one smooth mesh over the whole Earth. */
export class FogLayer extends Layer<FogLayerProps> {
  static layerName = 'FogLayer';
  static defaultProps = defaultProps;

  declare state: {
    model?: Model;
    positions?: Buffer;
    values?: Buffer;
    edges?: Buffer;
    indices?: Buffer;
    version: number;
  };

  getShaders() {
    return super.getShaders({vs, fs, modules: [project32, fogUniforms]});
  }

  initializeState() {
    const {device} = this.context;
    const {mesh, values, edges} = this.props;
    const positions = device.createBuffer({usage: Buffer.VERTEX, data: mesh.positions});
    const valueBuffer = device.createBuffer({usage: Buffer.VERTEX | Buffer.COPY_DST, data: values});
    const edgeBuffer = device.createBuffer({usage: Buffer.VERTEX | Buffer.COPY_DST, data: edges});
    const indices = device.createBuffer({usage: Buffer.INDEX, data: mesh.indices});
    const model = new Model(device, {
      ...this.getShaders(),
      id: `${this.props.id}-mesh`,
      bufferLayout: [
        {name: 'positions', format: 'float32x2'},
        {name: 'fogValues', format: 'unorm8x4'},
        {name: 'fogEdges', format: 'unorm8x4'},
      ],
      attributes: {positions, fogValues: valueBuffer, fogEdges: edgeBuffer},
      indexBuffer: indices,
      vertexCount: mesh.indices.length,
      topology: 'triangle-list',
    });
    this.state = {model, positions, values: valueBuffer, edges: edgeBuffer, indices, version: this.props.version};
  }

  updateState(params: UpdateParameters<this>) {
    super.updateState(params);
    if (params.props.version !== this.state.version) {
      this.state.values?.write(params.props.values);
      this.state.edges?.write(params.props.edges);
      this.state.version = params.props.version;
    }
  }

  finalizeState(context: Parameters<Layer['finalizeState']>[0]) {
    super.finalizeState(context);
    this.state.model?.destroy();
    this.state.positions?.destroy();
    this.state.values?.destroy();
    this.state.edges?.destroy();
    this.state.indices?.destroy();
  }

  draw() {
    const {model} = this.state;
    if (!model) return;
    model.shaderInputs.setProps({fog: this.props.uniforms as unknown as Record<string, unknown>});
    model.draw(this.context.renderPass);
  }
}
