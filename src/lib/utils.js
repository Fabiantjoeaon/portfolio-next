import { BufferGeometry, BufferAttribute, Vector3 } from "three/webgpu";

export const fullscreenTriangle = () => {
  let geometry = new BufferGeometry();

  const vertices = new Float32Array([-1, -1, 3, -1, -1, 3]);
  const uvs = new Float32Array([0, 0, 2, 0, 0, 2]);

  geometry.setAttribute("position", new BufferAttribute(vertices, 2));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));

  // HINT: Fixes bounding sphere error because for some reason
  // the latest version of THREE does not like position attributes
  // with a count of 2 (center.z and radius are NaN in this case)
  geometry.boundingSphere = {
    center: new Vector3(1, 1, 0),
    radius: 0,
  };

  return geometry;
};

export const fsTriangle = fullscreenTriangle();
