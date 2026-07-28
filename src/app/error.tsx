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
    <main className="mx-auto max-w-3xl w-full px-6 py-12 flex-1">
      <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
      <p className="text-sm text-gray-600 mb-6">
        The page failed to load. This has been logged on the server.
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium hover:bg-gray-800"
      >
        Try again
      </button>
    </main>
  );
}
