import { basename } from 'node:path';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { reorder, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import type { Plugin } from 'vite';

/** Pack only the GLBs referenced by the production scene, retaining authoring files. */
export function packPondModels(): Plugin {
  const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.ERROR))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  return {
    name: 'pack-pond-models',
    apply: 'build',
    enforce: 'pre',
    async load(id) {
      if (!id.includes('/public/models/') || !id.endsWith('.glb?url')) return;
      const path = id.slice(0, -4);
      this.addWatchFile(path);
      await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
      const doc = await io.read(path);
      await doc.transform(weld(), reorder({ encoder: MeshoptEncoder, target: 'size' }));
      // Plant wind, swan markings and cat skinning use mesh-local positions.
      // Bound their precision in-place so the scene's node transforms stay intact.
      const positions = new Set(doc.getRoot().listMeshes().flatMap(mesh =>
        mesh.listPrimitives().flatMap(prim => [prim, ...prim.listTargets()].map(p => p.getAttribute('POSITION')))));
      for (const position of positions) {
        const values = position?.getArray();
        if (!position || !(values instanceof Float32Array)) continue;
        const extent = Math.max(...position.getMin([]).map(Math.abs), ...position.getMax([]).map(Math.abs));
        if (!extent) continue;
        const scale = 2 ** (15 - Math.ceil(Math.log2(extent)));
        for (let i = 0; i < values.length; i++) values[i] = Math.round(values[i] * scale) / scale;
      }
      doc.createExtension(EXTMeshoptCompression).setRequired(true)
        .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
      const ref = this.emitFile({ type: 'asset', name: basename(path), source: await io.writeBinary(doc) });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
}
