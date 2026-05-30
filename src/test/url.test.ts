import { describe, it, expect } from "vitest";
import {
  deriveTitleFromUrl,
  getHostname,
  normalizeUrl,
  tryParseUrl,
} from "@/lib/url";

describe("url helpers", () => {
  it("strips www. and returns hostname", () => {
    expect(getHostname("https://www.example.com/foo")).toBe("example.com");
    expect(getHostname("https://example.co.in/")).toBe("example.co.in");
    expect(getHostname("not a url")).toBe("");
  });

  it("normalizes url-ish strings to https", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeUrl("   https://example.com  ")).toBe("https://example.com");
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("not a url with spaces")).toBeNull();
  });

  it("tryParseUrl never throws", () => {
    expect(tryParseUrl("https://example.com")).toBeInstanceOf(URL);
    expect(tryParseUrl("garbage")).toBeNull();
  });

  it("derives a friendly title from a url", () => {
    expect(deriveTitleFromUrl("https://www.youtube.com/")).toBe("Youtube");
    expect(deriveTitleFromUrl("https://github.com/foo/bar")).toBe("Github");
    expect(deriveTitleFromUrl("not a url")).toBe("Untitled");
  });
});
