import { Suspense } from "react";

import { ExplorerFromUrl } from "@/components/explorer-from-url";
import { getMapsConfig } from "@/lib/config";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <h1>Architecture Explorer</h1>
        <p>Discover significant architecture around you.</p>
      </header>
      <main>
        {/* Reading the page address needs a Suspense boundary on a static page. */}
        <Suspense fallback={<p className="page-loading">Loading the explorer…</p>}>
          <ExplorerFromUrl config={getMapsConfig()} />
        </Suspense>
      </main>
    </>
  );
}
