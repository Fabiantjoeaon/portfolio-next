import * as THREE from "three/webgpu";

/**
 * Creates a WebGPU-compatible GBuffer render target with:
 * - 2 color attachments: [0] albedo, [1] normals
 * - 1 depth texture
 *
 * Note:
 * - No allocations in the frame loop. Recreate only on resize.
 * - Formats favor quality with half-float where available.
 */
export function createGBuffer(width, height, devicePixelRatio = 1) {
  const w = Math.max(1, Math.floor(width * devicePixelRatio));
  const h = Math.max(1, Math.floor(height * devicePixelRatio));

  // Create MRT with two color attachments
  const renderTarget = new THREE.RenderTarget(w, h, {
    count: 2,
    depthBuffer: true,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  // Name attachments for MRT mapping
  renderTarget.textures[0].name = "output";
  renderTarget.textures[1].name = "normal";

  // Depth texture for sampling in post
  renderTarget.depthTexture = new THREE.DepthTexture(w, h);
  renderTarget.depthTexture.format = THREE.DepthFormat;
  renderTarget.depthTexture.type = THREE.UnsignedIntType;

  // Convenience getters
  function getAlbedoTexture() {
    return renderTarget.textures[0];
  }
  function getNormalTexture() {
    return renderTarget.textures[1];
  }
  function getDepthTexture() {
    return renderTarget.depthTexture;
  }

  function dispose() {
    getAlbedoTexture()?.dispose();
    getNormalTexture()?.dispose();
    getDepthTexture()?.dispose();
    renderTarget.dispose();
  }

  return {
    target: renderTarget,
    get albedo() {
      return getAlbedoTexture();
    },
    get normals() {
      return getNormalTexture();
    },
    get depth() {
      return getDepthTexture();
    },
    dispose,
  };
}

export function resizeGBuffer(gbuffer, width, height, devicePixelRatio = 1) {
  if (!gbuffer?.target) return;
  // Recreate entire GBuffer to avoid partial allocations
  gbuffer.dispose?.();
  return createGBuffer(width, height, devicePixelRatio);
}


