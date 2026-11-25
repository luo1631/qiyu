import { Primitive } from '@gltf-transform/core';
import { compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

const passengerRatios = new Map([
  ['CH_Cloth', .34],
  ['CH_HairBase', .42],
  ['CH_HairLight', .46],
  ['CH_Skin', .62],
  ['CH_Pillow', .36],
  // The sculpt's voxel density resolves fingertips. The untextured arms
  // and legs can use the same geometric error bound as the other surfaces.
  ['Sleeper_Skin', .30],
]);

export async function simplifyBoat(document) {
  await MeshoptSimplifier.ready;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const ratio = passengerRatios.get(primitive.getMaterial()?.getName());
      if (ratio) simplifySurface(document, primitive, ratio);
    }
  }
}

function simplifySurface(document, primitive, ratio) {
  const indices = primitive.getIndices();
  const position = primitive.getAttribute('POSITION');
  const positions = position?.getArray();
  const normals = primitive.getAttribute('NORMAL')?.getArray();
  const uv = primitive.getAttribute('TEXCOORD_0')?.getArray();
  if (!indices || !(positions instanceof Float32Array) || !normals) return;
  if (primitive.getMode() !== Primitive.Mode.TRIANGLES ||
      primitive.listSemantics().some(semantic => !['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(semantic))) return;

  const count = position.getCount();
  const attributeStride = uv ? 5 : 3;
  const attributes = new Float32Array(count * attributeStride);
  const weights = uv ? [.065, .065, .065, .045, .045] : [.065, .065, .065];
  const locks = new Uint8Array(count);
  const minima = position.getMin([]), maxima = position.getMax([]);
  for (let vertex = 0; vertex < count; vertex++) {
    const normal = vertex * 3, first = vertex * attributeStride;
    attributes[first] = normals[normal];
    attributes[first + 1] = normals[normal + 1];
    attributes[first + 2] = normals[normal + 2];
    if (uv) {
      attributes[first + 3] = uv[vertex * 2];
      attributes[first + 4] = uv[vertex * 2 + 1];
    }
    for (let axis = 0; axis < 3; axis++) {
      const component = positions[normal + axis];
      if (component === minima[axis] || component === maxima[axis]) locks[vertex] = 1;
    }
  }

  // Keep bounds, UV seams and hard edges. The error budget is in authoring metres.
  const indexCount = indices.getCount();
  const target = Math.max(3, Math.floor(indexCount / 3 * ratio) * 3);
  const [simplified] = MeshoptSimplifier.simplifyWithAttributes(
    Uint32Array.from(indices.getArray()), positions, 3, attributes, attributeStride,
    weights, locks, target, .0032, ['LockBorder', 'ErrorAbsolute'],
  );
  if (!simplified.length || simplified.length >= indexCount) return;
  primitive.setIndices(document.createAccessor().setArray(simplified));
  compactPrimitive(primitive);
  if (indices.listParents().length === 1) indices.dispose();
}
