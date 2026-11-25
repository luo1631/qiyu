import { Color, MeshStandardMaterial, ShaderChunk } from 'three';
import { skyNoiseGLSL } from './PondAtmosphere';

const canopyPaint = `
  varying vec3 canopyPoint;
  varying vec3 canopyNormal;

  float leafDaub(vec2 point, vec2 direction, vec2 size) {
    vec2 p = vec2(dot(point, vec2(direction.y, -direction.x)), dot(point, direction)) / size;
    float scallop = .045 * sin(p.y * 12.0 + p.x * 2.8);
    return 1.0 - smoothstep(.83, 1.07, length(p) + scallop);
  }

  vec2 brushClumps(vec2 p) {
    vec2 cell = floor(p);
    vec2 seed = gradient(cell + vec2(8.4, 3.6)) * .5 + .5;
    vec2 q = fract(p) - (.5 + .16 * (seed - .5));
    float angle = 1.94 * (seed.x - .5);
    q = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * q;
    float middle = leafDaub(q - vec2(.006,.055), vec2(.11,.994), vec2(.082,.218));
    float left = leafDaub(q - vec2(-.113,.010), vec2(-.68,.733), vec2(.074,.192));
    float right = leafDaub(q - vec2(.108,.001), vec2(.70,.714), vec2(.071,.179));
    float group = max(middle, max(left * .81, right * (.63 + .27 * seed.x)));
    float arc = q.x - .115 * q.y - .32 * q.y * q.y;
    float line = (1.0 - smoothstep(.006,.027,abs(arc))) * middle * (1.0 - smoothstep(.076,.18,abs(q.y)));
    return vec2(group * (.67 + .33 * seed.y), line);
  }

  vec2 brushField(vec2 p) {
    vec2 movement = vec2(noise(p * .58), noise(p * .61 + vec2(11.7, 2.9)));
    p += movement * .39;
    vec2 large = brushClumps(p);
    vec2 small = brushClumps(mat2(.85, .53, -.53, .85) * p * 1.61 + vec2(5.3, 6.8));
    return vec2(max(large.x, small.x * .57), max(large.y, small.y * .70));
  }
`;

/** A restrained pigment and softer leaf-to-leaf light response. Keep the actual
 * sun/moon, fog and cast shadows: no emissive fill that would glow at night.
 * Apply to owned material clones, since onBeforeCompile is not copied by clone. */
export function softenVegetation(material:MeshStandardMaterial,wood=false,keepPigment=false,paint=false) {
  const paintedLeaf = paint && !wood;
  material.roughness=paintedLeaf ? .98 : .91;material.metalness=0;
  material.userData.pondVegetation=wood?'wood':'leaves';
  const barkLow = new Color('#494036'), barkHigh = new Color('#907254');
  material.onBeforeCompile=shader=>{
    if (wood) {
      shader.uniforms.barkLow = { value: barkLow };
      shader.uniforms.barkHigh = { value: barkHigh };
      shader.vertexShader = 'varying vec3 barkPoint;\n' + (paint ? 'attribute vec2 _bark_grain;\nvarying vec2 barkGrain;\n' : '') + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nbarkPoint = (modelMatrix * vec4(transformed, 1.0)).xyz;' + (paint ? '\nbarkGrain = _bark_grain;' : ''));
      shader.fragmentShader = skyNoiseGLSL + '\nvarying vec3 barkPoint;\nuniform vec3 barkLow;\nuniform vec3 barkHigh;\n'
        + (paint ? 'varying vec2 barkGrain;\n' : '') + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        ${paint ? `
        float along = barkGrain.y;
        float around = barkGrain.x;
        vec2 ring = vec2(cos(around * 6.283185), sin(around * 6.283185));
        float swell = .5 + .5 * noise(ring * 2.8 + along * vec2(.34, .62));
        float filament = around * 11.0 + .29 * sin(along * 1.61) + swell * .76;
        float ridge = abs(fract(filament) - .5);
        float edge = max(.025, min(.30, fwidth(filament)));
        float split = (1.0 - smoothstep(.065, .10 + edge, ridge)) * smoothstep(.33, .72, swell);
        float fine = .5 + .5 * noise(ring * 11.0 + along * vec2(.59, 1.72));
        vec3 bark = mix(barkHigh, barkLow, .21 + .39 * swell + .19 * split);
        diffuseColor.rgb = mix(bark, diffuseColor.rgb, .26) * (.90 + .18 * fine - .13 * split);
        diffuseColor.rgb *= mix(vec3(.76, .89, .71), vec3(1.0), smoothstep(.21, .76, barkPoint.y));
        ` : `
        // Two oblique projections carry the fibres around knots and forks.
        float curve = noise(barkPoint.xz * 1.6 + barkPoint.y * vec2(.83,.40));
        vec2 grain = vec2(dot(barkPoint.xz, vec2(.86,.51)) + curve * .055, barkPoint.y);
        vec2 pores = vec2(dot(barkPoint.xz, vec2(-.57,.82)) - curve * .036, barkPoint.y);
        float coarse = noise(grain * vec2(18.0, 2.5) + vec2(1.3, 3.5));
        float fibre = noise(pores * vec2(59.0, 8.2) + coarse * .72);
        float pixel = max(length(dFdx(grain)), length(dFdy(grain)));
        float detail = 1.0 - smoothstep(.010, .034, pixel);
        float fissure = smoothstep(.04, .47, coarse + fibre * detail * .29);
        vec3 bark = mix(barkHigh, barkLow, fissure);
        diffuseColor.rgb = mix(bark, diffuseColor.rgb, ${keepPigment ? '.52' : '.27'});
        diffuseColor.rgb *= 1.0 - fissure * detail * .14 + fibre * detail * .14;
        `}
      `);
    } else {
      shader.uniforms.plantLeafTone={value:new Color('#728766')};
      shader.uniforms.plantWoodTone={value:new Color('#7d725f')};
      if (paint) {
        shader.vertexShader = 'varying vec3 canopyPoint;\nvarying vec3 canopyNormal;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          vec4 brushPoint = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            brushPoint = instanceMatrix * brushPoint;
          #endif
          canopyPoint = (modelMatrix * brushPoint).xyz;
          canopyNormal = transpose(mat3(viewMatrix)) * transformedNormal;
        `);
      }
      shader.fragmentShader=(paint ? skyNoiseGLSL + canopyPaint : '') + 'uniform vec3 plantLeafTone;\nuniform vec3 plantWoodTone;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float plantGreen=smoothstep(.012,.065,diffuseColor.g-diffuseColor.r);
        diffuseColor.rgb=mix(mix(plantWoodTone,plantLeafTone,plantGreen),diffuseColor.rgb,${keepPigment?'.95':'.69'});
        ${paint ? `
        vec3 facing = normalize(canopyNormal);
        float higher = smoothstep(-.39, .86, facing.y);
        vec3 planes = max(abs(facing) - .20, vec3(.001));
        planes *= planes * planes;
        planes /= dot(planes, vec3(1.0));
        vec2 strokes = brushField(canopyPoint.zy * 4.05 + vec2(4.31, 1.82)) * planes.x
          + brushField(canopyPoint.xz * 4.18 + vec2(1.2, 4.7)) * planes.y
          + brushField(canopyPoint.xy * 4.06 + vec2(8.22, 5.39)) * planes.z;
        float footprint = length(fwidth(canopyPoint));
        float fade = 1.0 - smoothstep(.033, .096, footprint);
        float wideWash = .5 + .5 * noise(canopyPoint.xz * 2.6 + canopyPoint.y * vec2(1.9, 2.2));
        float brush = mix(.30, strokes.x, fade);
        float tone = .11 + .24 * higher + .50 * brush + .16 * wideWash;
        vec3 pigments = mix(vec3(.61,.74,.85), vec3(1.43,1.35,1.18), tone);
        pigments *= 1.0 - .12 * strokes.y * (1.0 - smoothstep(.016, .053, footprint)) * fade;
        float ink = ${keepPigment ? '1.0' : 'plantGreen'};
        diffuseColor.rgb *= mix(vec3(1.0), pigments, ink);
        ` : ''}
      `);
    }
    // The painted crowns keep shadow between branches and a diffuse finish.
    const wrap = wood ? '.12' : paintedLeaf ? '.20' : '.35';
    const divisor = wood ? '1.12' : paintedLeaf ? '1.20' : '1.35';
    const sunShadow = wood ? '.70' : paintedLeaf ? '.39' : '.22';
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',
      ShaderChunk.lights_physical_pars_fragment.replace(
        'reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );',
        `reflectedLight.directDiffuse += saturate((dot(geometryNormal,directLight.direction)+${wrap})/${divisor}) * directLight.color * diffuseBRDF * (1.0-F);`));
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',
      ShaderChunk.lights_fragment_begin.replace('directionalLightShadow.shadowIntensity,',`directionalLightShadow.shadowIntensity * ${sunShadow},`));
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',
      `#include <lights_fragment_end>\nreflectedLight.directSpecular *= ${paintedLeaf ? '.05' : '.25'};`);
  };
  material.customProgramCacheKey=()=>`pond-vegetation-6-${wood?'wood':'leaves'}-${keepPigment}-${paint}`;
  return material;
}
