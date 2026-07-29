"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error:", error);
  }, [error]);

  return (
    <main id="main" className="mx-auto max-w-3xl w-full px-6 py-12 flex-1">
      <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        The page failed to load. This has been logged on the server.
      </p>
      <button
        onClick={reset}
        className="min-h-11 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
      >
        Try again
      </button>
    </main>
  );
}
