import assert from "node:assert/strict";
import { test } from "node:test";
import { isEmbeddedWebViewUserAgent } from "../../src/lib/embedded-browser";

const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.0.0 Mobile Safari/537.36";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";
const IOS_WKWEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const FACEBOOK_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.0]";
const LINE_ANDROID =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Line/13.0.0 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";
const DESKTOP_FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0";

test("flags known in-app browsers (Facebook, LINE)", () => {
  assert.equal(isEmbeddedWebViewUserAgent(FACEBOOK_IOS), true);
  assert.equal(isEmbeddedWebViewUserAgent(LINE_ANDROID), true);
});

test("flags Android System WebView by its ';wv)' token", () => {
  assert.equal(isEmbeddedWebViewUserAgent(ANDROID_WEBVIEW), true);
});

test("flags a bare iOS WKWebView lacking the Safari Version/ token", () => {
  assert.equal(isEmbeddedWebViewUserAgent(IOS_WKWEBVIEW), true);
});

test("does not flag real desktop or mobile browsers", () => {
  assert.equal(isEmbeddedWebViewUserAgent(CHROME_ANDROID), false);
  assert.equal(isEmbeddedWebViewUserAgent(SAFARI_IOS), false);
  assert.equal(isEmbeddedWebViewUserAgent(DESKTOP_CHROME), false);
  assert.equal(isEmbeddedWebViewUserAgent(DESKTOP_FIREFOX), false);
});

test("does not flag other WebKit-based iOS browsers (Chrome/Firefox/Edge for iOS)", () => {
  assert.equal(isEmbeddedWebViewUserAgent(CHROME_IOS), false);
});

test("treats missing or empty user agents as not embedded", () => {
  assert.equal(isEmbeddedWebViewUserAgent(null), false);
  assert.equal(isEmbeddedWebViewUserAgent(undefined), false);
  assert.equal(isEmbeddedWebViewUserAgent(""), false);
});
