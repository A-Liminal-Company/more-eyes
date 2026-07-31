import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
// Mutable so individual tests can simulate a `?previous=<id>` URL. Read lazily
// inside the factory, which Vitest calls when `next/navigation` is imported —
// by then each test's `beforeEach`/body has already set it.
let mockSearchParamsString = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(mockSearchParamsString),
}));

import SubmitPage from "./page";

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Title"), "Divide");
  await user.type(
    screen.getByLabelText("What's it supposed to do?"),
    "Divides two numbers"
  );
  await user.type(screen.getByLabelText("Code"), "a / b");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParamsString = "";
});

describe("SubmitPage", () => {
  it("renders all form fields with accessible labels", () => {
    render(<SubmitPage />);

    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(
      screen.getByLabelText("What's it supposed to do?")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Language")).toBeInTheDocument();
    expect(screen.getByLabelText("Code")).toBeInTheDocument();
  });

  it("navigates to the review page on success", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ submission: { id: "abc123" } }),
      })
    );

    render(<SubmitPage />);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/review/abc123"));
  });

  it("shows the server error message and does not navigate on failure", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "ANTHROPIC_API_KEY is not configured." }),
      })
    );

    render(<SubmitPage />);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("ANTHROPIC_API_KEY is not configured.");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("surfaces a network failure without navigating", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<SubmitPage />);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/network error/i);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("moves focus to the error so screen readers announce it", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Something broke." }),
      })
    );

    render(<SubmitPage />);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("sends format: diff when the unified-diff checkbox is checked", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submission: { id: "abc123" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SubmitPage />);
    await fillForm(user);
    await user.click(screen.getByLabelText("This is a unified diff"));
    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/review/abc123"));

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.format).toBe("diff");
  });

  it("defaults format to code when the checkbox is left unchecked", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submission: { id: "abc123" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SubmitPage />);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/review/abc123"));

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.format).toBe("code");
  });

  describe("re-reviewing via ?previous=", () => {
    beforeEach(() => {
      mockSearchParamsString = "previous=prev-1";
    });

    it("prefills the form from the previous submission and shows a note", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          submission: {
            id: "prev-1",
            title: "Original title",
            description: "Original description",
            language: "python",
            code: "print('hi')",
          },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<SubmitPage />);

      await waitFor(() =>
        expect(screen.getByLabelText("Title")).toHaveValue("Original title")
      );
      expect(screen.getByLabelText("What's it supposed to do?")).toHaveValue(
        "Original description"
      );
      expect(screen.getByLabelText("Language")).toHaveValue("python");
      expect(screen.getByLabelText("Code")).toHaveValue("print('hi')");
      expect(fetchMock).toHaveBeenCalledWith("/api/reviews/prev-1");
      expect(
        screen.getByText((_, node) =>
          node?.textContent === "Re-reviewing: Original title"
        )
      ).toBeInTheDocument();
    });

    it("includes previousSubmissionId in the POST body once loaded", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/reviews/prev-1") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              submission: {
                id: "prev-1",
                title: "Original title",
                description: "Original description",
                language: "python",
                code: "print('hi')",
              },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ submission: { id: "new-1" } }),
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<SubmitPage />);
      await waitFor(() =>
        expect(screen.getByLabelText("Title")).toHaveValue("Original title")
      );

      await user.click(screen.getByRole("button", { name: /submit for review/i }));

      await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/review/new-1"));

      const postCall = fetchMock.mock.calls.find(
        (call) => call[0] === "/api/reviews"
      );
      const body = JSON.parse((postCall?.[1] as RequestInit).body as string);
      expect(body.previousSubmissionId).toBe("prev-1");
    });

    it("dismisses the note without losing the previousSubmissionId link", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          submission: {
            id: "prev-1",
            title: "Original title",
            description: "Original description",
            language: "python",
            code: "print('hi')",
          },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<SubmitPage />);
      await waitFor(() =>
        expect(screen.getByLabelText("Title")).toHaveValue("Original title")
      );

      await user.click(screen.getByRole("button", { name: /dismiss/i }));

      expect(screen.queryByText(/Re-reviewing:/)).not.toBeInTheDocument();
      // Still prefilled — dismissing the note only hides the reminder.
      expect(screen.getByLabelText("Title")).toHaveValue("Original title");
    });

    it("silently proceeds as a fresh submission when the previous submission 404s", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Submission not found." }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<SubmitPage />);

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("/api/reviews/prev-1")
      );
      expect(screen.getByLabelText("Title")).toHaveValue("");
      expect(screen.queryByText(/Re-reviewing:/)).not.toBeInTheDocument();
    });
  });
});
