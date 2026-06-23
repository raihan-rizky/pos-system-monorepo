import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
}));

describe("GET /api/prntsc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ id: "user-1", role: "CASHIER" });
    handleAuthErrorMock.mockReturnValue(null);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects non-prnt.sc URLs before fetching", async () => {
    const response = await GET(
      new Request("http://localhost/api/prntsc?url=https%3A%2F%2Fexample.com%2Fprnt.sc"),
    );

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects attacker-controlled image URLs discovered in metadata", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response('<meta property="og:image" content="https://127.0.0.1/admin">', {
        status: 200,
      }),
    );

    const response = await GET(
      new Request("http://localhost/api/prntsc?url=https%3A%2F%2Fprnt.sc%2Fabc123"),
    );

    expect(response.status).toBe(422);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not proxy non-image responses from allowed image hosts", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(
          '<meta property="og:image" content="https://image.prntscr.com/image/example.png">',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response("<html>not an image</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );

    const response = await GET(
      new Request("http://localhost/api/prntsc?url=https%3A%2F%2Fprnt.sc%2Fabc123"),
    );

    expect(response.status).toBe(502);
  });

  it("returns the resolved image URL in json mode", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        '<meta property="og:image" content="https://image.prntscr.com/image/example.png">',
        { status: 200 },
      ),
    );

    const response = await GET(
      new Request("http://localhost/api/prntsc?url=https%3A%2F%2Fprnt.sc%2Fabc123&json=true"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.imageUrl).toBe("https://image.prntscr.com/image/example.png");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
