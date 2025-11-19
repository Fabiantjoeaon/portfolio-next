import * as THREE from "three";

export function setupScene(renderer, controls) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e12);

  const { innerWidth, innerHeight } = window;

  const camera = new THREE.PerspectiveCamera(
    60,
    innerWidth / innerHeight,
    0.1,
    1000
  );
  camera.position.set(3, 2, 5);
  camera.lookAt(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(
    0xffffff,
    controls?.lightIntensity ?? 1.0
  );
  directionalLight.position.set(5, 10, 7.5);
  scene.add(directionalLight);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(controls?.color ?? 0x6ee7b7),
    roughness: 0.35,
    metalness: 0.1,
  });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  const grid = new THREE.GridHelper(10, 10, 0x334155, 0x1f2937);
  scene.add(grid);

  function update(elapsedMs) {
    const t = elapsedMs * 0.001;
    const rx = controls?.rotateX ?? 0.6;
    const ry = controls?.rotateY ?? 0.9;
    cube.rotation.x = t * rx;
    cube.rotation.y = t * ry;
  }

  function setCubeColor(hex) {
    material.color.set(hex);
  }

  function setLightIntensity(intensity) {
    directionalLight.intensity = intensity;
  }

  return { scene, camera, update, setCubeColor, setLightIntensity };
}
