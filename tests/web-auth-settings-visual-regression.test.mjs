import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../src/components/global-top-bar.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("guest header action stays on one line at phone widths", () => {
  assert.match(header, />Join \/ Log in</);
  assert.match(styles, /\.nav-control \{[^}]*white-space: nowrap;[^}]*flex-shrink: 0;/);
  assert.match(styles, /\.mobile-topbar \.nav-download-link \{ display: none; \}/);
  assert.match(styles, /\.mobile-topbar \.icon-control svg \{ width: 20px; height: 20px;/);
});

test("auth controls and provider marks remain bounded", () => {
  assert.match(home, /auth-field-icon/);
  assert.match(styles, /\.auth-field-icon \{[^}]*width:19px;[^}]*height:19px;[^}]*flex:0 0 19px;/);
  assert.match(styles, /\.auth-provider-icon svg \{[^}]*width:17px;[^}]*height:17px;[^}]*max-width:17px;[^}]*max-height:17px;/);
  assert.match(styles, /\.auth-provider-icon img \{[^}]*width:19px;[^}]*height:19px;[^}]*object-fit:contain;/);
  assert.match(styles, /\.auth-sign-in-dialog form>input:not\(\[type="checkbox"\]\),\.auth-sign-in-dialog form>select \{ width:100%;/);
  assert.match(styles, /\.auth-sign-in-dialog form>div>input\[name="username"\] \{ width:100%;/);
  assert.match(home, /google-g\.svg/);
  assert.match(home, /facebook-f\.svg/);
  assert.match(home, /M18\.244 2\.25h3\.308/);
  assert.match(home, /socialLogin\("apple"\)[\s\S]*socialLogin\("google"\)[\s\S]*socialLogin\("facebook"\)[\s\S]*socialLogin\("x"\)/);
});

test("settings tabs constrain icons and preserve accessible tab behavior", () => {
  assert.match(settings, /role="tablist" aria-label="Settings sections"/);
  assert.match(settings, /role="tab" aria-selected=\{primaryTab === key\}/);
  assert.match(styles, /\.settings-nav-icon \{[^}]*width:29px;[^}]*height:29px;[^}]*flex:0 0 29px;/);
  assert.match(styles, /\.page-settings \.settings-nav-icon>svg \{[^}]*width:18px !important;[^}]*height:18px !important;/);
  assert.match(styles, /\.page-settings \.settings-parity-tabs button:focus-visible \{ outline:3px solid/);
});

test("signed-in settings summary bounds portrait, location and action icons", () => {
  assert.match(settings, /userId \? <Link href="\/profile" className="settings-parity-hero"/);
  assert.match(styles, /\.page-settings \.settings-parity-hero>img,[\s\S]*?width:56px; height:56px;[\s\S]*?flex:0 0 56px;[\s\S]*?object-fit:cover;/);
  assert.match(styles, /\.page-settings \.settings-parity-hero small svg \{[^}]*width:13px;[^}]*height:13px;[^}]*flex:0 0 13px;/);
  assert.match(styles, /\.page-settings \.settings-parity-hero>\.settings-profile-link \{[^}]*width:38px;[^}]*height:38px;[^}]*flex:0 0 38px;/);
  assert.match(styles, /\.page-settings \{ padding:10px 14px calc\(110px \+ env\(safe-area-inset-bottom\)\) !important;/);
});
