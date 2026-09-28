import styles from "./place.module.css";

/** Shown until properly licensed photographs are available. */
export function ImagePlaceholder() {
  return (
    <div className={styles.placeholder} role="img" aria-label="No photograph available yet">
      <svg viewBox="0 0 64 40" aria-hidden="true">
        <path d="M6 36V18l12-8 12 8v18M34 36V8h24v28M2 36h60" />
        <path d="M14 36v-9h8v9M40 15h4M48 15h4M40 22h4M48 22h4M40 29h4M48 29h4" />
      </svg>
    </div>
  );
}
