/**
 * Simplified worker utilities for text rendering
 * Based on troika-worker-utils but adapted for this use case
 */

const workerModules = new Map();
const workers = new Map();

/**
 * Define a worker module
 */
export function defineWorkerModule(config) {
  const { name, dependencies = [], init, getTransferables } = config;

  // For main thread fallback
  const mainThreadFn = function (...args) {
    if (!mainThreadFn._initialized) {
      const depValues = dependencies.map((dep) => {
        if (typeof dep === "function" && dep._getInitResult) {
          return dep._getInitResult();
        }
        return dep;
      });
      mainThreadFn._result = init(...depValues);
      mainThreadFn._initialized = true;
    }

    return new Promise((resolve) => {
      const result =
        typeof mainThreadFn._result === "function"
          ? mainThreadFn._result(...args)
          : mainThreadFn._result;
      resolve(result);
    });
  };

  mainThreadFn._getInitResult = () => {
    if (!mainThreadFn._initialized) {
      const depValues = dependencies.map((dep) => {
        if (typeof dep === "function" && dep._getInitResult) {
          return dep._getInitResult();
        }
        return dep;
      });
      mainThreadFn._result = init(...depValues);
      mainThreadFn._initialized = true;
    }
    return mainThreadFn._result;
  };

  mainThreadFn.onMainThread = mainThreadFn;

  // Store module
  workerModules.set(name, { config, mainThreadFn });

  return mainThreadFn;
}

/**
 * Terminate a worker
 */
export function terminateWorker(workerId) {
  const worker = workers.get(workerId);
  if (worker) {
    worker.terminate();
    workers.delete(workerId);
  }
}
