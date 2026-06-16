export function markTTI(): void {
  if (typeof performance !== "undefined") {
    performance.mark("tti");
  }
}

export function reportWebVitals(metric: unknown): void {
  // Stub for Vercel Analytics integration
  void metric;
}
