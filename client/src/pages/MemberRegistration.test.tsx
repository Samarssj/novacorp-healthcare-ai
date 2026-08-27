// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const registerMember = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    care: {
      registerMember: { useMutation: () => ({ mutate: registerMember, isPending: false, error: null }) },
    },
  },
}));

import MemberRegistration from "./MemberRegistration";

describe("MemberRegistration", () => {
  afterEach(() => {
    cleanup();
    registerMember.mockReset();
  });

  it("collects name, date of birth, mobile number, and address before creating a permanent member ID", async () => {
    const user = userEvent.setup();
    render(<MemberRegistration />);

    await user.type(screen.getByLabelText(/full name/i), "Taylor Morgan");
    await user.type(screen.getByLabelText(/date of birth/i), "1990-10-21");
    await user.type(screen.getByLabelText(/mobile number/i), "555-016-7700");
    await user.type(screen.getByLabelText(/^address line 1/i), "125 River Road");
    await user.type(screen.getByLabelText(/^city/i), "Portland");
    await user.type(screen.getByLabelText(/state/i), "OR");
    await user.type(screen.getByLabelText(/postal code/i), "97201");
    await user.click(screen.getByRole("button", { name: /create healthcare id/i }));

    expect(registerMember).toHaveBeenCalledWith({
      name: "Taylor Morgan",
      dateOfBirth: "1990-10-21",
      phoneNumber: "555-016-7700",
      address: { line1: "125 River Road", city: "Portland", state: "OR", postalCode: "97201", country: "United States" },
    });
  });
});
