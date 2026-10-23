import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../src/components/global-top-bar.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8");
const interests = readFileSync(new URL("../src/components/settings-interests.tsx", import.meta.url), "utf8");
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

test("preferences interests heading bounds its star icon", () => {
  assert.match(interests, /className="settings-parity-interests"><h2><AppIcon name="star" \/>Interests/);
  assert.match(styles, /\.page-settings \.settings-parity-interests h2 svg \{[^}]*display:inline-block;[^}]*width:20px;[^}]*height:20px;[^}]*max-width:20px;[^}]*max-height:20px;/);
});

test("preferences theme and interest choices remain distinct accessible targets", () => {
  assert.match(settings, /className="settings-theme-grid" role="group" aria-label="Theme"/);
  assert.match(settings, /aria-pressed=\{themePref === value\}/);
  assert.match(interests, /className="settings-interest-chips"/);
  assert.match(interests, /role="checkbox" aria-checked=\{ids\.includes\(category\.id\)\}/);
  assert.match(styles, /\.page-settings \.settings-theme-grid \{[^}]*display:grid;[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\);[^}]*gap:8px;/);
  assert.match(styles, /\.page-settings \.settings-theme-grid button \{[^}]*min-height:44px;[^}]*border-radius:14px;/);
  assert.match(styles, /\.page-settings \.settings-interest-chips \{[^}]*display:flex;[^}]*flex-wrap:wrap;[^}]*gap:8px;/);
  assert.match(styles, /\.page-settings \.settings-interest-chips button \{[^}]*min-height:44px;[^}]*border-radius:999px;/);
  assert.match(styles, /\.page-settings \.settings-interest-chips button\[aria-checked="true"\] \{[^}]*background:#9bd8e4;/);
});

test("settings parity selectors cover every existing control group", () => {
  assert.match(settings, /className="settings-parity-secondary" aria-label="Account settings"/);
  assert.match(styles, /\.page-settings \.settings-parity-secondary button \{[^}]*min-height:44px;[^}]*border-radius:12px;/);
  assert.match(styles, /\.page-settings \.settings-parity-secondary button\[aria-pressed="true"\] \{/);

  assert.match(settings, /className="settings-section-heading"/);
  assert.match(styles, /\.page-settings \.settings-section-heading h2 \{[^}]*font-size:22px;[^}]*font-weight:900;/);

  assert.match(settings, /className="settings-native-card"/);
  assert.match(styles, /\.page-settings \.settings-native-card \{[^}]*display:grid;[^}]*padding:16px;[^}]*border-radius:20px;/);
  assert.match(styles, /\.page-settings \.settings-native-card textarea \{[^}]*min-height:44px;/);

  assert.match(settings, /className="settings-photo-options"/);
  assert.match(styles, /\.page-settings \.settings-photo-options summary \{[^}]*min-height:44px;[^}]*cursor:pointer;/);

  assert.match(settings, /settings-people-cards/);
  assert.match(settings, /settings-blocked-card/);
  assert.match(styles, /\.page-settings \.settings-people-cards>div,[\s\S]*?\.page-settings \.settings-blocked-card \{[^}]*padding:16px;[^}]*background:#151722 !important;/);
  assert.match(styles, /\.page-settings \.settings-blocked-card \{ margin-top:20px; \}/);
});

test("populated people rows retain contrast, wrapping, and 44px actions", () => {
  assert.match(settings, /friendsProfiles\.map[\s\S]*?className="settings-person-row[^\"]*"[\s\S]*?className="settings-person-action[^\"]*"[\s\S]*?>\s*Remove\s*</);
  assert.match(settings, /friendRequests\.map[\s\S]*?className="settings-person-row[^\"]*"[\s\S]*?className="settings-request-actions[^\"]*"[\s\S]*?className="settings-person-action[^\"]*"[\s\S]*?>\s*Accept\s*</);
  assert.match(settings, /friendRequests\.map[\s\S]*?className="settings-request-actions[^\"]*"[\s\S]*?>\s*Accept\s*<[\s\S]*?className="settings-person-action[^\"]*"[\s\S]*?\{request\.direction === "incoming" \? "Decline" : "Cancel"\}/);
  assert.match(settings, /blockedProfiles\.map[\s\S]*?className="settings-person-row[^\"]*"[\s\S]*?className="settings-person-action[^\"]*"[\s\S]*?>Unblock</);

  assert.match(styles, /\.page-settings \.settings-parity-secondary \{[^}]*flex-wrap:wrap;/);
  assert.match(styles, /\.page-settings \.settings-person-row \{[^}]*flex-wrap:wrap;[^}]*color:#f8fafc;[^}]*background:#10121a !important;/);
  assert.match(styles, /\.page-settings \.settings-request-actions \{[^}]*flex-wrap:wrap;[^}]*justify-content:flex-end;/);
  assert.match(styles, /\.page-settings \.settings-request-actions>span \{ color:#9aa5b5 !important; \}/);
  assert.match(styles, /\.page-settings \.settings-person-action \{ min-height:44px !important; \}/);
});
