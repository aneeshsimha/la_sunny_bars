"use client";

import { forwardRef } from "react";

interface MapContainerProps {
  className?: string;
  style?: React.CSSProperties;
}

const MapContainer = forwardRef<HTMLDivElement, MapContainerProps>(
  ({ className, style }, ref) => {
    return (
      <div
        ref={ref}
        className={className ?? "map-container"}
        style={style}
      />
    );
  }
);

MapContainer.displayName = "MapContainer";

export default MapContainer;
