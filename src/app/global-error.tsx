"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] fatal error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="font-sans p-12">
        <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-600 mb-6">
          The application failed to load.
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
