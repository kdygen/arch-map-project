import styles from "./map.module.css";

export type MapProblem = "missing-key" | "auth-failed" | "load-failed";

const CONTENT: Record<MapProblem, { title: string; steps: string[] }> = {
  "missing-key": {
    title: "Google Maps is not configured",
    steps: [
      "Create a browser key in Google Cloud with the Maps JavaScript API enabled.",
      "Add NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=your-key to apps/web/.env.local.",
      "Restart the frontend with make web.",
    ],
  },
  "auth-failed": {
    title: "Google Maps rejected the API key",
    steps: [
      "Check that the key in apps/web/.env.local is correct.",
      "Check that the key allows this website address as an HTTP referrer.",
      "Check that the Maps JavaScript API is enabled and billing is active.",
    ],
  },
  "load-failed": {
    title: "Google Maps could not be loaded",
    steps: [
      "Check your internet connection.",
      "Check that a browser extension is not blocking maps.googleapis.com.",
      "Reload the page to try again.",
    ],
  },
};

export function MapNotice({ problem }: { problem: MapProblem }) {
  const { title, steps } = CONTENT[problem];
  return (
    <div className={styles.notice} role="alert">
      <h2>{title}</h2>
      <p>The map cannot be shown. The place catalog itself is not affected.</p>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
