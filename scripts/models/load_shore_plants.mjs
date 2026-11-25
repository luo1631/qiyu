/** Offline loader for the same uncompressed GLB used by the browser. */
import { NodeIO } from '@gltf-transform/core';
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three';
import { resolve } from 'node:path';

export async function loadShorePlantKit(path=resolve('public/models/shore-plants.glb')) {
  const doc=await new NodeIO().read(path),cache=new Map(),material=new MeshStandardMaterial({vertexColors:true,roughness:.88,side:DoubleSide});
  const visit=node=>{
    const root=new Group();root.name=node.getName();root.matrixAutoUpdate=false;root.matrix.fromArray(node.getMatrix());root.userData=node.getExtras();
    for(const primitive of node.getMesh()?.listPrimitives()??[]) {
      let geometry=cache.get(primitive);
      if(!geometry){
        geometry=new BufferGeometry();geometry.name=node.getMesh().getName();
        for(const [semantic,name] of Object.entries({POSITION:'position',NORMAL:'normal',COLOR_0:'color'})){
          const attr=primitive.getAttribute(semantic);if(attr)geometry.setAttribute(name,new BufferAttribute(attr.getArray(),attr.getElementSize(),attr.getNormalized()));
        }
        if(primitive.getIndices())geometry.setIndex(new BufferAttribute(primitive.getIndices().getArray(),1));cache.set(primitive,geometry);
      }
      const part = new Mesh(geometry, material);
      part.userData = root.userData;
      root.add(part);
    }
    for(const child of node.listChildren())root.add(visit(child));return root;
  };
  const group=new Group();for(const child of doc.getRoot().listScenes()[0].listChildren())group.add(visit(child));group.updateMatrixWorld(true);
  return {group,dispose(){for(const geometry of cache.values())geometry.dispose();material.dispose();}};
}
