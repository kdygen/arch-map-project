import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// The default of 1 second is too tight on a busy CI machine.
configure({ asyncUtilTimeout: 3000 });

afterEach(() => {
  cleanup();
});
