import { Pane } from 'tweakpane';

export function setupPane(controls, api) {
  const pane = new Pane({
    title: 'Controls'
  });

  pane.addBinding(controls, 'rotateX', {
    label: 'rot X',
    min: 0.0,
    max: 3.0,
    step: 0.01
  });

  pane.addBinding(controls, 'rotateY', {
    label: 'rot Y',
    min: 0.0,
    max: 3.0,
    step: 0.01
  });

  const colorBinding = pane.addBinding(controls, 'color', {
    label: 'color',
    view: 'color'
  });
  colorBinding.on('change', (ev) => {
    api?.setCubeColor?.(ev.value);
  });

  const lightBinding = pane.addBinding(controls, 'lightIntensity', {
    label: 'light',
    min: 0.0,
    max: 3.0,
    step: 0.01
  });
  lightBinding.on('change', (ev) => {
    api?.setLightIntensity?.(ev.value);
  });

  return pane;
}


