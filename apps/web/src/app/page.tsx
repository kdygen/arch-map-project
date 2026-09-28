import { Explorer } from "@/components/explorer";
import { getMapsConfig } from "@/lib/config";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <h1>Architecture Explorer</h1>
        <p>Discover significant architecture around you.</p>
      </header>
      <main>
        <Explorer config={getMapsConfig()} />
      </main>
    </>
  );
}
