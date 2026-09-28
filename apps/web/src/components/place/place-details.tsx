"use client";

import { useEffect, useRef } from "react";

import type { PlaceDetailState } from "@/hooks/use-place-detail";
import type { PlaceDetail } from "@/lib/api/places";
import {
  formatAccessibility,
  formatAdmission,
  formatArchitects,
  formatMinutes,
  formatPublicAccess,
  formatYearBuilt,
  formatYesNoUnknown,
  groupOpeningHours,
  groupSources,
  safeExternalUrl,
} from "@/lib/format/place";

import { ImagePlaceholder } from "./image-placeholder";
import styles from "./place.module.css";
import { PlaceFacts } from "./place-facts";

type Props = {
  name: string;
  state: PlaceDetailState;
  onBack: () => void;
};

export function PlaceDetails({ name, state, onBack }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);

  // Move keyboard and screen reader focus to the newly opened details.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <article className={styles.card} aria-labelledby="details-title">
      <button type="button" className={styles.quiet} onClick={onBack}>
        ← Back to preview
      </button>
      <h2 id="details-title" ref={heading} tabIndex={-1}>
        {name}
      </h2>

      {state.status === "loading" && <p role="status">Loading details…</p>}

      {state.status === "error" && (
        <div role="alert" className={styles.problem}>
          <p>
            {state.error.status === 404
              ? "This place is no longer available."
              : "The details could not be loaded."}
          </p>
          {state.error.status !== 404 && (
            <button type="button" className={styles.primary} onClick={state.retry}>
              Try again
            </button>
          )}
        </div>
      )}

      {state.status === "ready" && <DetailBody place={state.place} />}
    </article>
  );
}

function DetailBody({ place }: { place: PlaceDetail }) {
  const website = safeExternalUrl(place.website_url);
  const hours = groupOpeningHours(place.opening_hours);
  const sources = groupSources(place.field_sources);
  const accessibility = formatAccessibility(place.accessibility);
  const { visit_minutes_exterior: exterior, visit_minutes_interior: interior } = place.curated;
  const address = [place.address_line ?? place.city.name].filter(Boolean).join(", ");

  return (
    <>
      {place.images.length === 0 && <ImagePlaceholder />}

      <PlaceFacts
        facts={[
          { label: "Address", value: address },
          { label: "Built", value: formatYearBuilt(place) },
          { label: "Architect", value: formatArchitects(place.architects, true) },
          { label: "Style", value: place.styles.map((s) => s.name).join(", ") },
          { label: "Type", value: place.building_type?.name ?? null },
          { label: "Period", value: place.period?.name ?? null },
        ]}
      />

      {place.description && (
        <section>
          <h3>About</h3>
          <p>{place.description}</p>
        </section>
      )}

      {place.significance_text && (
        <section>
          <h3>Why it matters</h3>
          <p>{place.significance_text}</p>
        </section>
      )}

      {place.tags.length > 0 && (
        <section>
          <h3>Notable features</h3>
          <ul className={styles.tags}>
            {place.tags.map((tag) => (
              <li key={tag.slug}>{tag.name}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Visiting</h3>
        <PlaceFacts
          facts={[
            { label: "Access", value: formatPublicAccess(place.public_access) },
            { label: "Admission", value: formatAdmission(place.admission_type) },
            { label: "Tours", value: formatYesNoUnknown(place.tours_available) },
            {
              label: "Reservation required",
              value: formatYesNoUnknown(place.reservation_required),
            },
            ...accessibility,
          ]}
        />
        {place.admission_notes && <p>{place.admission_notes}</p>}

        {hours.length > 0 && (
          <>
            <h4>Visiting hours</h4>
            <table className={styles.hours}>
              <tbody>
                {hours.map((day) => (
                  <tr key={day.day}>
                    <th scope="row">{day.day}</th>
                    <td>{day.intervals.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.note}>
              Hours can change. Check the official website before you go.
            </p>
          </>
        )}

        {(exterior !== null || interior !== null) && (
          <>
            <h4>Estimated visit time</h4>
            <PlaceFacts
              facts={[
                {
                  label: "Seeing the exterior",
                  value: exterior !== null ? `About ${formatMinutes(exterior)}` : null,
                },
                {
                  label: "Visiting inside",
                  value: interior !== null ? `About ${formatMinutes(interior)}` : null,
                },
              ]}
            />
            <p className={styles.note}>
              These are our own estimates, not information from the venue.
            </p>
          </>
        )}

        {website && (
          <p>
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Official website (opens in a new tab)"
            >
              Official website
            </a>
          </p>
        )}
      </section>

      {sources.length > 0 && (
        <section>
          <h3>Sources</h3>
          <ul className={styles.sources}>
            {sources.map((source) => {
              const url = safeExternalUrl(source.url);
              return (
                <li key={source.url}>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                    </a>
                  ) : (
                    source.title
                  )}
                  <span className={styles.note}>
                    {source.publisher}. Supports: {source.supports.join(", ")}.
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
