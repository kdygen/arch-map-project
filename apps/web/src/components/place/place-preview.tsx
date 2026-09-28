import type { PlaceSummary } from "@/lib/api/places";
import {
  formatAdmission,
  formatArchitects,
  formatPublicAccess,
  formatYearBuilt,
} from "@/lib/format/place";

import { ImagePlaceholder } from "./image-placeholder";
import styles from "./place.module.css";
import { PlaceFacts } from "./place-facts";

type Props = {
  place: PlaceSummary;
  onViewDetails: () => void;
  onClose: () => void;
};

export function PlacePreview({ place, onViewDetails, onClose }: Props) {
  return (
    <article className={styles.card} aria-labelledby="preview-title">
      <ImagePlaceholder />
      <div className={styles.cardHeader}>
        <h2 id="preview-title">{place.name}</h2>
        <button
          type="button"
          className={styles.quiet}
          aria-label={`Close preview of ${place.name}`}
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <PlaceFacts
        facts={[
          { label: "Built", value: formatYearBuilt(place) },
          { label: "Style", value: place.primary_style?.name ?? null },
          { label: "Architect", value: formatArchitects(place.architects) },
          { label: "Type", value: place.building_type?.name ?? null },
          { label: "Access", value: formatPublicAccess(place.public_access) },
          { label: "Admission", value: formatAdmission(place.admission_type) },
        ]}
      />
      <button
        type="button"
        className={styles.primary}
        aria-label={`View details for ${place.name}`}
        onClick={onViewDetails}
      >
        View details
      </button>
    </article>
  );
}
