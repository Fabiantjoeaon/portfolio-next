export class TransitionManager {
  constructor(sceneManager, { idleMs = 1000, transitionMs = 500 } = {}) {
    this.sceneManager = sceneManager;
    this.idleMs = idleMs;
    this.transitionMs = transitionMs;
    this.sceneIds = [];
    this.sceneInstances = [];
    this.prevIdx = 0;
    this.nextIdx = 0;
    this.t0 = 0;
    this.phase = "idle";
  }

  setSequence(sceneIds, sceneInstances) {
    this.sceneIds = sceneIds ?? [];
    this.sceneInstances = sceneInstances ?? [];
  }

  start(nowMs) {
    if (!this.sceneIds.length) return;
    this.prevIdx = 0;
    this.nextIdx = this.sceneIds.length > 1 ? 1 : 0;
    this.sceneManager.setActivePair(
      this.sceneIds[this.prevIdx],
      this.sceneIds[this.nextIdx]
    );
    // Begin in idle phase showing prev fully (mix = 0)
    this._applyNextTransition();
    this.sceneManager.setMix(0);
    this.phase = "idle";
    this.t0 = nowMs ?? performance.now();
  }

  _applyNextTransition() {
    const nextInst = this.sceneInstances[this.nextIdx];
    const transition = nextInst?.transition ?? null;
    if (transition && this.sceneManager?.post?.material?.setTransition) {
      this.sceneManager.post.material.setTransition(transition);
    }
  }

  onTransitionComplete() {
    // The scene we just transitioned TO (at nextIdx) becomes the new prevIdx
    this.prevIdx = this.nextIdx;
    // Calculate what the next scene will be (for the upcoming transition)
    this.nextIdx = (this.prevIdx + 1) % this.sceneIds.length;

    // Update the active pair to reflect the new prev/next
    this.sceneManager.setActivePair(
      this.sceneIds[this.prevIdx],
      this.sceneIds[this.nextIdx]
    );

    // DON'T apply the next transition yet - textures haven't been updated!
    // We'll apply it when starting the next transition

    // Reset mix to 0 to display prev (the scene we just transitioned to)
    this.sceneManager.setMix(0);
    this.phase = "idle";
  }

  update(nowMs) {
    if (!this.sceneIds.length) return;

    const elapsed = nowMs - this.t0;

    if (this.phase === "idle") {
      // Hold current scene (prev) fully visible at mix=0
      if (elapsed >= this.idleMs) {
        // Start transition - apply the transition NOW after textures have been rendered
        // This will mark the shader for rebuild on next render
        this._applyNextTransition();
        this.phase = "transition";
        this.t0 = nowMs;
      }
    } else {
      // Transition phase: 0 -> 1 over transitionMs
      const mix = Math.min(Math.max(elapsed / this.transitionMs, 0), 1);

      this.sceneManager.setMix(mix);
      if (mix >= 1) {
        this.onTransitionComplete();
        this.t0 = nowMs;
      }
    }
  }
}
