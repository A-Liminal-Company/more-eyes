import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
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
});
