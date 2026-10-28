import {LayerExtension} from '@deck.gl/core';

/**
 * On the globe, hide anything on the far side of the Earth. Overlay layers draw without depth
 * testing (they sit exactly on the surface and would flicker against it), so this does the culling.
 *
 * A hidden vertex is flagged rather than moved, and every fragment of a shape that touches one is
 * discarded: moving it off-screen would stretch a path segment crossing the horizon into a line
 * across the sky. Icons and labels test their anchor, so each is kept or dropped whole.
 */
export class HorizonCullExtension extends LayerExtension {
  static extensionName = 'HorizonCullExtension';

  getShaders() {
    return {
      inject: {
        'vs:#decl': /* glsl */ `out float vHorizonHidden;`,
        'vs:DECKGL_FILTER_GL_POSITION': /* glsl */ `
          vHorizonHidden = 0.0;
          if (project.projectionMode == PROJECTION_MODE_GLOBE) {
            vec3 hp = project_position(vec4(geometry.worldPosition, 1.0), vec3(0.0)).xyz;
            if (dot(normalize(hp), project.cameraPosition - hp) < 0.0) vHorizonHidden = 1.0;
          }
        `,
        'fs:#decl': /* glsl */ `in float vHorizonHidden;`,
        'fs:DECKGL_FILTER_COLOR': /* glsl */ `
          if (vHorizonHidden > 0.0) discard;
        `,
      },
    };
  }
}

export const horizonCull = new HorizonCullExtension();

/** Overlay layers sit on the surface: no depth test, no depth writes. */
export const SURFACE_PARAMETERS = {depthCompare: 'always', depthWriteEnabled: false} as const;
