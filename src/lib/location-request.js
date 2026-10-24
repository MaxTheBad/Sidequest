/** Serialize browser geolocation requests and ignore callbacks that no longer own the request. */
export function createLocationRequestGate() {
  let generation = 0;
  let activeGeneration = 0;
  return {
    request(geolocation, handlers, options) {
      if (activeGeneration) return false;
      const operation = ++generation;
      activeGeneration = operation;
      handlers.onStart();
      geolocation.getCurrentPosition(
        (position) => {
          if (activeGeneration !== operation) return;
          activeGeneration = 0;
          handlers.onSuccess(position);
        },
        (error) => {
          if (activeGeneration !== operation) return;
          activeGeneration = 0;
          handlers.onError(error);
        },
        options,
      );
      return true;
    },
    cancel() {
      generation += 1;
      activeGeneration = 0;
    },
    isActive() {
      return activeGeneration !== 0;
    },
  };
}
