import { Box3, InstancedMesh, Light, Mesh, Vector3 } from 'three';
import type { Object3D } from 'three';

export const reflectionLayer = 1;
export const refractionLayer = 2;
export const shadowLayer = 3;
export const waterLevel = .004;
export const waterPassMargin = .025;

function setWaterLayers(object: Object3D, reflection: boolean, refraction: boolean) {
  if (reflection) object.layers.enable(reflectionLayer);
  else object.layers.disable(reflectionLayer);
  if (refraction) object.layers.enable(refractionLayer);
  else object.layers.disable(refractionLayer);
}

/** These bits are separate from the main camera and from pointer raycasts. */
export function setWaterPasses(root: Object3D, reflection: boolean, refraction: boolean) {
  root.traverse(object => {
    if (!(object instanceof Mesh) && !(object instanceof Light)) return;
    setWaterLayers(object, reflection, refraction);
  });
}

/** The assembled boat translates and pitches as one body. Reuse local bounds
 * for its rigid parts so the reflected passenger is never drawn under water. */
export function trackWaterPasses(root: Object3D) {
  const parts: { mesh: Mesh; center: Vector3; extent: Vector3 }[] = [];
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const source = object instanceof InstancedMesh ? object : object.geometry;
    if (!source.boundingBox) source.computeBoundingBox();
    const bounds = source.boundingBox;
    if (bounds && !bounds.isEmpty()) {
      parts.push({ mesh: object, center: bounds.getCenter(new Vector3()), extent: bounds.getSize(new Vector3()).multiplyScalar(.5) });
    }
  });
  const center = new Vector3();
  return () => {
    root.updateWorldMatrix(true, true);
    for (const part of parts) {
      center.copy(part.center).applyMatrix4(part.mesh.matrixWorld);
      const m = part.mesh.matrixWorld.elements;
      const radius = Math.abs(m[1]) * part.extent.x + Math.abs(m[5]) * part.extent.y + Math.abs(m[9]) * part.extent.z;
      setWaterLayers(part.mesh, center.y + radius >= waterLevel - waterPassMargin, center.y - radius <= waterLevel + waterPassMargin);
    }
  };
}

/** The planar cameras clip triangles at the surface. Reject entire dry or
 * submerged static meshes first, while keeping both passes for crossing forms. */
export function classifyWaterPasses(scene: Object3D) {
  const bounds = new Box3();
  scene.updateMatrixWorld(true);
  scene.traverse(object => {
    if (object instanceof Light) {
      setWaterLayers(object, true, true);
    }
    if (!(object instanceof Mesh)) return;
    const source = object instanceof InstancedMesh ? object : object.geometry;
    if (!source.boundingBox) source.computeBoundingBox();
    if (!source.boundingBox || source.boundingBox.isEmpty()) return;
    bounds.copy(source.boundingBox).applyMatrix4(object.matrixWorld);
    setWaterLayers(object, bounds.max.y >= waterLevel - waterPassMargin, bounds.min.y <= waterLevel + waterPassMargin);
  });
}

export function setShadowCasters(root: Object3D, enabled: boolean) {
  root.traverse(object => {
    if (!(object instanceof Mesh) || !object.castShadow) return;
    if (enabled) object.layers.enable(shadowLayer);
    else object.layers.disable(shadowLayer);
  });
}
