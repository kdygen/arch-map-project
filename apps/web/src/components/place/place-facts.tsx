import type { ReactNode } from "react";

import styles from "./place.module.css";

export type Fact = { label: string; value: ReactNode | null };

/** A definition list that leaves out facts we do not have. */
export function PlaceFacts({ facts }: { facts: Fact[] }) {
  const known = facts.filter((fact) => fact.value !== null && fact.value !== "");
  if (known.length === 0) return null;
  return (
    <dl className={styles.facts}>
      {known.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
