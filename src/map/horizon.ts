import {LayerExtension} from '@deck.gl/core';

/**
 * On the globe, hide anything on the far side of the Earth. Overlay layers draw without depth
 * testing (they sit exactly on the surface and would flicker against it), so this does the culling.
 */
export class HorizonCullExtension extends LayerExtension {
  static extensionName = 'HorizonCullExtension';

  getShaders() {
    return {
      inject: {
        'vs:DECKGL_FILTER_GL_POSITION': /* glsl */ `
          // Test the anchor (not each corner), so an icon is kept or dropped whole instead of being stretched.
          if (project.projectionMode == PROJECTION_MODE_GLOBE) {
            vec3 hp = project_position(vec4(geometry.worldPosition, 1.0), vec3(0.0)).xyz;
            if (dot(normalize(hp), project.cameraPosition - hp) < 0.0) position = vec4(2.0, 2.0, 2.0, 1.0);
          }
        `,
      },
    };
  }
}

export const horizonCull = new HorizonCullExtension();

/** Overlay layers sit on the surface: no depth test, no depth writes. */
export const SURFACE_PARAMETERS = {depthCompare: 'always', depthWriteEnabled: false} as const;
