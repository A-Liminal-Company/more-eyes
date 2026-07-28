"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  MAX_CODE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
} from "@/lib/validation";

export default function SubmitPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, language, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      router.push(`/review/${data.submission.id}`);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl w-full px-6 py-12 flex-1">
      <h1 className="text-2xl font-semibold mb-8">Submit code for review</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1">
            Title
          </label>
          <input
            id="title"
            type="text"
            required
            maxLength={MAX_TITLE_LENGTH}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. Stripe webhook handler"
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium mb-1"
          >
            What&apos;s it supposed to do?
          </label>
          <textarea
            id="description"
            required
            maxLength={MAX_DESCRIPTION_LENGTH}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Brief context so the reviewer knows what correct behavior looks like"
          />
        </div>

        <div>
          <label
            htmlFor="language"
            className="block text-sm font-medium mb-1"
          >
            Language
          </label>
          <input
            id="language"
            type="text"
            required
            maxLength={50}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. typescript, python, go"
          />
        </div>

        <div>
          <label htmlFor="code" className="block text-sm font-medium mb-1">
            Code
          </label>
          <textarea
            id="code"
            required
            maxLength={MAX_CODE_LENGTH}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={16}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
            placeholder="Paste the code you want reviewed"
          />
          <p className="text-xs text-gray-500 mt-1">
            {code.length}/{MAX_CODE_LENGTH} characters
          </p>
        </div>

        {error && (
          <p
            ref={errorRef}
            tabIndex={-1}
            className="text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="self-start rounded-md bg-black text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? "Reviewing…" : "Submit for review"}
        </button>

        <p aria-live="polite" className="sr-only">
          {submitting ? "Review in progress, please wait." : ""}
        </p>
      </form>
    </main>
  );
}
