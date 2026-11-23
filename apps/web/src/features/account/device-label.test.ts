import { describe, expect, it } from "vitest";
import { describeDevice } from "./device-label";

const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/130.0.0.0`;
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const FIREFOX_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0";

describe("describeDevice", () => {
  it.each([
    [CHROME_WINDOWS, "Chrome su Windows"],
    [EDGE_WINDOWS, "Edge su Windows"],
    [SAFARI_IPHONE, "Safari su iPhone"],
    [CHROME_ANDROID, "Chrome su Android"],
    [FIREFOX_MAC, "Firefox su Mac"],
  ])("names %#", (userAgent, expected) => {
    expect(describeDevice(userAgent)).toBe(expected);
  });

  it("says so when there is nothing to recognise", () => {
    expect(describeDevice(null)).toBe("Dispositivo sconosciuto");
    expect(describeDevice("curl/8.5.0")).toBe("Dispositivo sconosciuto");
  });

  it("names what it can when only one of the two is known", () => {
    expect(describeDevice("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Linux");
    expect(describeDevice("Safari/605.1.15")).toBe("Safari");
  });
});
