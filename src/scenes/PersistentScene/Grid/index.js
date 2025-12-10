import * as THREE from "three/webgpu";
import { useViewportStore } from "../../../state/store.js";
import { createTileGeometry, createTileMaterial } from "./GridTile.js";
import { GridCompute } from "./GridCompute.js";

/**
 * Grid - A responsive grid of GPU-driven instanced tiles
 * Uses compute shaders to control per-tile properties
 */
export class Grid extends THREE.Group {
  /**
   * @param {Object} config - Grid configuration
   * @param {number} config.tileSize - Size of each tile in world units
   * @param {number} config.gap - Gap between tiles in world units
   * @param {number} config.cornerRadius - Corner radius for rounded rectangles
   * @param {number} config.depth - Tile depth/thickness (z-axis)
   * @param {Object} config.bevel - Bevel options { enabled, thickness, size, segments }
   * @param {THREE.Vector3} config.position - Initial position of the grid
   * @param {number} config.color - Base color for tiles
   * @param {number} config.opacity - Base opacity for tiles
   * @param {THREE.WebGPURenderer} config.renderer - WebGPU renderer for compute
   */
  constructor(config = {}) {
    super();

    this.config = {
      bevel: {
        enabled: config.bevel?.enabled ?? true,
        thickness: config.bevel?.thickness ?? undefined, // auto-calculated if undefined
        size: config.bevel?.size ?? undefined,
        segments: config.bevel?.segments ?? 2,
      },

      ...config,
    };

    this.renderer = config.renderer;

    // Grid state
    this.cols = 0;
    this.rows = 0;
    this.count = 0;

    // Components
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.compute = null;

    // Position buffer for base grid positions
    this.positionBuffer = null;

    // Subscribe to viewport changes
    this._unsubscribe = useViewportStore.subscribe((state) => {
      this._onViewportChange(state.viewport);
    });

    // Initial build with current viewport
    const { viewport } = useViewportStore.getState();
    this._onViewportChange(viewport);

    // Set initial position if provided
    if (config.position) {
      this.position.copy(config.position);
    }
  }

  /**
   * Handle viewport changes
   * @param {Object} viewport - { width, height, devicePixelRatio }
   */
  _onViewportChange(viewport) {
    const { tileSize, gap } = this.config;
    const cellSize = tileSize + gap;

    // Calculate how many tiles fit in the viewport
    // Using a camera-relative calculation assuming orthographic or known FOV
    // For now, use a simple pixel-to-world ratio (can be adjusted)
    const worldWidth = viewport.width * 0.01; // Rough conversion
    const worldHeight = viewport.height * 0.01;

    const newCols = Math.floor(worldWidth / cellSize);
    const newRows = Math.floor(worldHeight / cellSize);
    const newCount = newCols * newRows;

    // Only rebuild if count changed
    if (newCount !== this.count || !this.mesh) {
      this.cols = newCols;
      this.rows = newRows;
      this.count = newCount;
      this._rebuild();
    } else {
      // Just update positions if viewport changed but count didn't
      this._updatePositions();
    }
  }

  /**
   * Rebuild the entire grid mesh and compute
   */
  _rebuild() {
    // Clean up existing
    if (this.mesh) {
      this.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }

    if (this.count <= 0) {
      this.mesh = null;
      return;
    }

    const { tileSize, cornerRadius, depth, bevel, color, opacity } =
      this.config;

    // Create geometry and material
    this.geometry = createTileGeometry(tileSize, cornerRadius, depth, 4, bevel);
    this.material = createTileMaterial({ color, opacity });

    // Create instanced mesh
    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      this.count
    );

    // Create or rebuild compute
    if (this.compute) {
      this.compute.rebuild(this.count, this.cols, this.rows);
    } else {
      this.compute = new GridCompute(this.count, this.cols, this.rows);
    }

    // Get compute buffers
    const buffers = this.compute.getBuffers();

    // Create position buffer for base grid positions
    this.positionBuffer = new THREE.InstancedBufferAttribute(
      new Float32Array(this.count * 3),
      3
    );

    // Set base positions
    this._updatePositions();

    // Attach all instance attributes to geometry
    this.geometry.setAttribute("instancePosition", this.positionBuffer);
    this.geometry.setAttribute("instanceOffset", buffers.instanceOffset);
    this.geometry.setAttribute("instanceScale", buffers.instanceScale);
    this.geometry.setAttribute("instanceColor", buffers.instanceColor);

    this.add(this.mesh);
  }

  /**
   * Update base grid positions (centering the grid)
   */
  _updatePositions() {
    if (!this.positionBuffer || this.count <= 0) return;

    const { tileSize, gap } = this.config;
    const cellSize = tileSize + gap;

    // Calculate grid dimensions
    const gridWidth = this.cols * cellSize - gap;
    const gridHeight = this.rows * cellSize - gap;

    // Offset to center the grid
    const offsetX = -gridWidth / 2 + tileSize / 2;
    const offsetY = -gridHeight / 2 + tileSize / 2;

    for (let i = 0; i < this.count; i++) {
      const col = i % this.cols;
      const row = Math.floor(i / this.cols);

      const x = col * cellSize + offsetX;
      const y = row * cellSize + offsetY;
      const z = 0;

      this.positionBuffer.array[i * 3] = x;
      this.positionBuffer.array[i * 3 + 1] = y;
      this.positionBuffer.array[i * 3 + 2] = z;
    }

    this.positionBuffer.needsUpdate = true;
  }

  /**
   * Update the grid - runs compute shader
   * @param {number} time - Time in milliseconds
   * @param {number} delta - Time delta in seconds
   */
  async update(time, delta) {
    if (!this.compute || !this.renderer || this.count <= 0) return;

    // Update compute uniforms
    this.compute.update(time * 0.001, delta); // Convert to seconds

    // Run compute shader
    await this.renderer.computeAsync(this.compute.getComputeNode());
  }

  /**
   * Set tile size
   * @param {number} size - New tile size
   */
  setTileSize(size) {
    this.config.tileSize = size;
    const { viewport } = useViewportStore.getState();
    this._onViewportChange(viewport);
  }

  /**
   * Set gap between tiles
   * @param {number} gap - New gap size
   */
  setGap(gap) {
    this.config.gap = gap;
    const { viewport } = useViewportStore.getState();
    this._onViewportChange(viewport);
  }

  /**
   * Set tile depth/thickness
   * @param {number} depth - New depth value
   */
  setDepth(depth) {
    this.config.depth = depth;
    this._rebuild();
  }

  /**
   * Set bevel options
   * @param {Object} bevel - { enabled, thickness, size, segments }
   */
  setBevel(bevel) {
    this.config.bevel = { ...this.config.bevel, ...bevel };
    this._rebuild();
  }

  /**
   * Set wave animation parameters
   * @param {Object} params - { amplitude, frequency, speed }
   */
  setWaveParams(params) {
    if (this.compute) {
      this.compute.setWaveParams(params);
    }
  }

  /**
   * Set base color
   * @param {number|THREE.Color} color - New base color
   */
  setColor(color) {
    if (this.material?.uniforms?.baseColor) {
      this.material.uniforms.baseColor.value.set(color);
    }
  }

  /**
   * Set base opacity
   * @param {number} opacity - New opacity (0-1)
   */
  setOpacity(opacity) {
    if (this.material?.uniforms?.opacity) {
      this.material.uniforms.opacity.value = opacity;
    }
  }

  /**
   * Set the scene texture for glass effect sampling
   * @param {THREE.Texture} texture - The active scene's albedo texture
   */
  setSceneTexture(texture) {
    if (this.material?._sceneTextureNode && texture) {
      this.material._sceneTextureNode.value = texture;
    }
  }

  /**
   * Get grid info
   * @returns {Object}
   */
  getInfo() {
    return {
      cols: this.cols,
      rows: this.rows,
      count: this.count,
      tileSize: this.config.tileSize,
      gap: this.config.gap,
      depth: this.config.depth,
      bevel: this.config.bevel,
    };
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    // Unsubscribe from viewport store
    if (this._unsubscribe) {
      this._unsubscribe();
    }

    // Clean up mesh
    if (this.mesh) {
      this.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }

    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.compute = null;
    this.positionBuffer = null;
  }
}
