import { useLocationStore } from "@/state/locationStore";

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 30_000,
};

/**
 * Requests the user's current position once.
 * Updates locationStore.permissionState based on the outcome.
 * Returns [lng, lat] on success, null on error or denial.
 */
export async function requestLocation(): Promise<[number, number] | null> {
  const { setPermissionState } = useLocationStore.getState();

  if (!navigator.geolocation) {
    setPermissionState("denied");
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPermissionState("granted");
        resolve([position.coords.longitude, position.coords.latitude]);
      },
      () => {
        setPermissionState("denied");
        resolve(null);
      },
      GEO_OPTIONS
    );
  });
}

/**
 * Watches the user's position continuously.
 * Calls callback with [lng, lat] on each update.
 * Returns an unsubscribe function that clears the watch.
 */
export function watchLocation(
  callback: (coords: [number, number]) => void
): () => void {
  if (!navigator.geolocation) return () => {};

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      callback([position.coords.longitude, position.coords.latitude]);
    },
    () => {
      useLocationStore.getState().setPermissionState("denied");
    },
    GEO_OPTIONS
  );

  return () => navigator.geolocation.clearWatch(watchId);
}
