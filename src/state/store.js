import { createStore } from 'zustand/vanilla';

export const useViewportStore = createStore((set) => ({
  viewport: {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2)
  },
  setViewport: (viewport) => set({ viewport })
}));


