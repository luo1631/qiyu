import { MeshStandardMaterial } from 'three';
import type { Material } from 'three';

/** Preserve authored cloth, skin, timber and wet-keel response in both viewers. */
export function boatMaterial(source: Material): Material {
  const material=source.clone();
  if(material instanceof MeshStandardMaterial) {
    material.roughness=Math.max(.25,material.roughness);
    material.metalness=Math.max(0,Math.min(1,material.metalness));
  }
  return material;
}
