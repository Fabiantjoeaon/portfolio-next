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
    // Finalize switch: next becomes prev; advance next
    this.prevIdx = this.nextIdx;
    this.nextIdx = (this.nextIdx + 1) % this.sceneIds.length;

    this.sceneManager.setActivePair(
      this.sceneIds[this.prevIdx],
      this.sceneIds[this.nextIdx]
    );
    // Back to idle phase with new pair; show prev fully (mix=0)

    // FIXME: When removing this it stays on the next scene
    // but then it doesnt transition properly
    // Somewhere here lies the root cause that scene transitions are not working properly
    this.sceneManager.setMix(0);
    this.phase = "idle";
  }

  update(nowMs) {
    if (!this.sceneIds.length) return;

    const elapsed = nowMs - this.t0;
    if (this.phase === "idle") {
      // Hold current scene (prev) fully visible
      //this.sceneManager.setMix(0);
      if (elapsed >= this.idleMs) {
        // Start transition to next scene
        this.phase = "transition";
        this.t0 = nowMs;
        // Ensure correct transition is applied for upcoming scene
        this._applyNextTransition();
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
