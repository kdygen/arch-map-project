"use client";

import { AdvancedMarker, Polyline, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo } from "react";

import { boundsOf, decodePolyline } from "@/lib/geo/polyline";
import type { Endpoint, Route } from "@/lib/routing/types";

import styles from "./map.module.css";

const FIT_PADDING_PX = 64;

function EndpointMarker({
  kind,
  endpoint,
}: {
  kind: "Origin" | "Destination";
  endpoint: Endpoint;
}) {
  return (
    <AdvancedMarker
      position={{ lat: endpoint.lat, lng: endpoint.lng }}
      title={`${kind}: ${endpoint.label}`}
      zIndex={2000}
    >
      {/* A square with a letter, so it differs from round place markers by shape and text. */}
      <div className={styles.endpoint} data-kind={kind.toLowerCase()}>
        <span aria-hidden="true">{kind === "Origin" ? "A" : "B"}</span>
      </div>
    </AdvancedMarker>
  );
}

/** Draws the active route and moves the map to show all of it. */
export function RouteLayer({ route }: { route: Route }) {
  const map = useMap();
  const path = useMemo(() => decodePolyline(route.polyline), [route.polyline]);

  useEffect(() => {
    if (!map) return;
    const bounds = boundsOf([
      ...path,
      { lat: route.origin.lat, lng: route.origin.lng },
      { lat: route.destination.lat, lng: route.destination.lng },
    ]);
    if (bounds) map.fitBounds(bounds, FIT_PADDING_PX);
    // Fit once per route. Later panning is left to the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, route.polyline]);

  return (
    <>
      {/* A dark casing under a lighter line keeps the route readable on any background. */}
      <Polyline path={path} strokeColor="#10243f" strokeOpacity={0.9} strokeWeight={8} zIndex={1} />
      <Polyline path={path} strokeColor="#3d8bfd" strokeOpacity={1} strokeWeight={4} zIndex={2} />
      <EndpointMarker kind="Origin" endpoint={route.origin} />
      <EndpointMarker kind="Destination" endpoint={route.destination} />
    </>
  );
}
