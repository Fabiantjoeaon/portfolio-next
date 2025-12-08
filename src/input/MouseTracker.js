import * as THREE from "three/webgpu";

export const mouse = {
  clientX: 0,
  clientY: 0,
  x: 0, // normalized -1 to 1
  y: 0, // normalized -1 to 1
  isDown: false,
};

class MouseTracker {
  constructor() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onResize = this.onResize.bind(this);

    this.init();
  }

  init() {
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("resize", this.onResize);
    
    // Initialize with center
    mouse.clientX = this.width / 2;
    mouse.clientY = this.height / 2;
    mouse.x = 0;
    mouse.y = 0;
  }

  updateMouse(x, y) {
    mouse.clientX = x;
    mouse.clientY = y;
    
    // Normalize to -1 to 1
    // (x / width) * 2 - 1
    // -( (y / height) * 2 - 1 )  (flip Y for standard 3D coordinate system usually, but let's check preference)
    // The provided example had:
    // x: evt.clientX / window.innerWidth,
    // y: evt.clientY / window.innerHeight,
    // But useMouseMove.js had:
    // const mousePosX = -1 + (x / windowSize.width) * 2;
    // const mousePosY = 1 - (y / windowSize.height) * 2;
    
    // I will use the -1 to 1 range as it's more useful for 3D.
    mouse.x = (x / this.width) * 2 - 1;
    mouse.y = 1 - (y / this.height) * 2; // Flip Y so up is positive
  }

  onPointerMove(e) {
    this.updateMouse(e.clientX, e.clientY);
  }

  onPointerDown(e) {
    mouse.isDown = true;
    this.updateMouse(e.clientX, e.clientY);
  }

  onPointerUp(e) {
    mouse.isDown = false;
    this.updateMouse(e.clientX, e.clientY);
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  dispose() {
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("resize", this.onResize);
  }
}

// Singleton instance
export const mouseTracker = new MouseTracker();

