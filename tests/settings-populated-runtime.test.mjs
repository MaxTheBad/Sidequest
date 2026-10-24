import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as settingsSections from "../src/lib/settings-sections.js";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(options = {}) {
  const slots = [];
  const pendingEffects = [];
  let hookIndex = 0;
  const hooks = {
    useState(initial) {
      const slot = hookIndex++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = hookIndex++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useMemo(factory, deps) {
      const slot = hookIndex++;
      const previous = slots[slot];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) slots[slot] = { deps, value: factory() };
      return slots[slot].value;
    },
    useEffect(callback, deps) {
      const slot = hookIndex++;
      const previous = slots[slot];
      if (!previous || !deps || deps.some((value, index) => value !== previous.deps[index])) {
        pendingEffects.push(() => { previous?.cleanup?.(); slots[slot] = { deps, cleanup: callback() }; });
      }
    },
  };

  const people = {
    friend: { id: "friend", display_name: "Friend Fixture", username: "friend", avatar_url: "https://example.test/friend.jpg" },
    pending: { id: "pending", display_name: "Pending Fixture", username: "pending", avatar_url: null },
    blocked: { id: "blocked", display_name: "Blocked Fixture", username: "blocked", avatar_url: null },
  };
  const calls = [];
  const authListeners = new Set();
  let initialSessionRead = false;
  let sessionReadCount = 0;
  let authSession = options.session === undefined
    ? { access_token: "fixture", user: { id: "user", email: "fixture@example.test" } }
    : options.session;
  function result(table, state, single) {
    if (table === "profiles" && single) {
      const id = state.id || authSession?.user?.id;
      const profile = options.profiles?.[id] || { display_name: "Rift", username: "rift", city: "Los Angeles", region: "CA", country_code: "US", bio: "Fixture bio", friends_visibility: "public", show_location: true, radius_km: 15, avatar_url: "https://example.test/rift.jpg", deactivated_at: null, people_discovery_enabled: true };
      return { data: profile, error: null };
    }
    if (table === "profiles" && state.ids) return { data: state.ids.map(id => people[id]).filter(Boolean), error: null };
    if (table === "people_discovery_settings") return { data: { birth_date: "1990-01-01", gender_identity: "Prefer not to say" }, error: null };
    if (table === "notification_preferences") return { data: { messages: true, comments: true, joined_comments: true, join_updates: true, join_requests: true, friend_requests: true, followed_posts: false, liked_categories: false, quest_reminders: true }, error: null };
    if (table === "friends" && state.status === "accepted") return { data: [{ requester_id: "user", addressee_id: "friend", status: "accepted" }], error: null };
    if (table === "friends" && state.status === "pending") return { data: [{ requester_id: "pending", addressee_id: "user", status: "pending" }], error: null };
    if (table === "friends" && state.status === "blocked") return { data: [{ requester_id: "user", addressee_id: "blocked", status: "blocked" }], error: null };
    return { data: single ? null : [], error: null };
  }
  function query(table) {
    const state = {};
    const api = {
      select() { return api; },
      eq(column, value) { state[column] = value; if (column === "status") state.status = value; return api; },
      or(value) { state.or = value; return api; },
      in(column, ids) { state.ids = ids; return api; },
      upsert(payload) {
        calls.push({ table, operation: "upsert", payload });
        return options.upsertDeferred?.promise || Promise.resolve({ error: options.upsertError || null });
      },
      update(payload) { calls.push({ table, operation: "update", payload, state }); return api; },
      delete() { state.deleted = true; calls.push({ table, operation: "delete", state }); return api; },
      maybeSingle() {
        const wait = options.profileDeferredByUser?.[state.id];
        if (wait && table === "profiles" && !wait.used) {
          wait.used = true;
          return wait.promise;
        }
        return Promise.resolve(result(table, state, true));
      },
      then(resolve, reject) {
        const value = state.deleted && options.deleteError ? { data: null, error: options.deleteError } : result(table, state, false);
        return Promise.resolve(value).then(resolve, reject);
      },
    };
    return api;
  }
  const supabase = {
    auth: {
      getSession: async () => {
        sessionReadCount += 1;
        if (!initialSessionRead && options.initialSessionDeferred) {
          initialSessionRead = true;
          return options.initialSessionDeferred.promise;
        }
        if (sessionReadCount > 1 && options.operationSessionDeferred && !options.operationSessionDeferred.used) {
          options.operationSessionDeferred.used = true;
          return options.operationSessionDeferred.promise;
        }
        return options.sessionError ? ({ data: { session: null }, error: options.sessionError }) : ({ data: { session: authSession }, error: null });
      },
      getUser: async () => ({ data: { user: { user_metadata: {} } }, user: { user_metadata: {} } }),
      updateUser: async payload => { calls.push({ operation: "auth.updateUser", payload }); return { error: null }; },
      signInWithPassword: async payload => { calls.push({ operation: "auth.signInWithPassword", payload }); return { error: null }; },
      signInWithOAuth: async payload => { calls.push({ operation: "auth.signInWithOAuth", payload }); return { error: null }; },
      signOut: async () => { calls.push({ operation: "auth.signOut" }); return {}; },
      onAuthStateChange(callback) { authListeners.add(callback); return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } }; },
    },
    from: query,
    rpc: async (name, payload) => { calls.push({ operation: "rpc", name, payload }); return { data: null, error: options.rpcError || null }; },
    storage: { from: bucket => ({
      upload(path, body, uploadOptions) { calls.push({ operation: "storage.upload", bucket, path, body, uploadOptions }); return options.photoUploadDeferred?.promise || Promise.resolve({ error: null }); },
      getPublicUrl(path) { return { data: { publicUrl: `https://fixture.invalid/${bucket}/${path}` } }; },
    }) },
  };
  const storage = new Map();
  const windowFixture = {
    location: { search: "", origin: "https://questhat.com", assign() {}, href: "" },
    history: { replaceState() {} },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false }), confirm: () => Boolean(options.confirm),
  };
  const dependencies = {
    react: hooks,
    "react/jsx-runtime": { Fragment: Symbol("Fragment"), jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/link": (props) => ({ type: "a", props }),
    "@/lib/settings-sections.js": settingsSections,
    "@/components/posthog-provider": { OptionalAnalyticsPreference: () => null },
    "@/components/settings-interests": { SettingsInterests: () => null },
    "@/lib/meetup-safety.js": { resetMeetupSafety: () => true },
    "@/components/city-autocomplete-input": () => null,
    "@/lib/countries": { COUNTRY_OPTIONS: [{ code: "US", name: "United States" }] },
    "@/lib/supabase": { getSupabaseClient: () => supabase },
    "@/lib/media-optimize": { isImageLikeFile: () => true, prepareImageForUpload: async file => options.normalizedPhotoDeferred ? options.normalizedPhotoDeferred.promise : file },
    "@/lib/use-username-availability": { useUsernameAvailability: () => "available" },
    "@/lib/username": { normalizeUsername: value => String(value).trim().toLowerCase() },
    "@/lib/security-audit": { recordSecurityAudit: async () => undefined },
    "@/components/app-icons": { AppIcon: (props) => ({ type: "svg", props }) },
    "@/lib/people-discovery": { ageFromBirthDate: () => 30, discoveryLocationErrorMessage: () => "", GENDER_IDENTITY_OPTIONS: ["Prefer not to say"] },
    "@/components/turnstile-invisible": { TurnstileInvisible: () => null },
  };
  const sandboxModule = { exports: {} };
  const source = readFileSync(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const documentFixture = { documentElement: { dataset: {} }, getElementById: () => ({ focus() {} }), createElement: tag => tag === "canvas" ? ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage() {} }), toBlob: callback => callback(new Blob(["fixture"], { type: "image/jpeg" })) }) : ({}) };
  class FixtureImage { width = 512; height = 512; onload; onerror; set src(_value) { queueMicrotask(() => this.onload?.()); } }
  const createdObjectUrls = [];
  const revokedObjectUrls = [];
  class FixtureURL extends URL {
    static createObjectURL() { const value = `blob:fixture-${createdObjectUrls.length + 1}`; createdObjectUrls.push(value); options.onCreateObjectURL?.(value); return value; }
    static revokeObjectURL(value) { revokedObjectUrls.push(value); }
  }
  vm.runInNewContext(output, {
    module: sandboxModule, exports: sandboxModule.exports, require: name => dependencies[name] ?? (() => { throw new Error(`Unstubbed dependency: ${name}`); })(),
    process: { env: {} }, window: windowFixture, document: documentFixture,
    navigator: { language: "en-US" }, URL: FixtureURL, URLSearchParams, Date, Map, Set, Promise, FormData: class { set() {} }, File: class {}, Blob, Image: FixtureImage, queueMicrotask, fetch: options.fetch || (async (url, init) => { calls.push({ operation: "fetch", url, init }); return { ok: true, json: async () => ({ ok: true }) }; }),
  });

  function render() { hookIndex = 0; return sandboxModule.exports.default(); }
  async function settle() {
    for (let pass = 0; pass < 4; pass += 1) {
      const effects = pendingEffects.splice(0);
      effects.forEach(effect => effect());
      await new Promise(resolve => setImmediate(resolve));
      render();
    }
    return render();
  }
  async function runPendingEffects() {
    const effects = pendingEffects.splice(0);
    effects.forEach(effect => effect());
    await new Promise(resolve => setImmediate(resolve));
  }
  function text(node) {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(text).join(" ");
    return text(node.props?.children);
  }
  function all(node, predicate, found = []) {
    if (Array.isArray(node)) node.forEach(child => all(child, predicate, found));
    else if (node && typeof node === "object") { if (predicate(node)) found.push(node); all(node.props?.children, predicate, found); }
    return found;
  }
  function emitAuth(session, event = session ? "SIGNED_IN" : "SIGNED_OUT") {
    authSession = session;
    authListeners.forEach(listener => listener(event, session));
  }
  function setSessionSilently(session) {
    authSession = session;
  }
  function unmount() {
    slots.forEach(slot => slot?.cleanup?.());
  }
  return { render, settle, runPendingEffects, text, all, storage, calls, emitAuth, setSessionSilently, unmount, documentFixture, createdObjectUrls, revokedObjectUrls };
}

test("actual populated Settings page preserves profile, theme, photo, people, and blocked controls", async () => {
  const app = fixture();
  app.render();
  let tree = await app.settle();
  assert.match(app.text(tree), /@rift/);
  assert.match(app.text(tree), /Los Angeles, CA/);
  assert.equal(app.all(tree, node => node.type === "summary" && app.text(node) === "Profile photo options").length, 1);
  const discovery = app.all(tree, node => node.type === "label" && app.text(node).includes("Show me in Find people"))[0];
  assert.equal(app.all(discovery, node => node.type === "input" && node.props.type === "checkbox")[0].props.checked, true);
  app.all(discovery, node => node.type === "input" && node.props.type === "checkbox")[0].props.onChange({ target: { checked: false } });
  tree = app.render();
  const profileForm = app.all(tree, node => node.type === "form" && app.all(node, child => child.type === "button" && app.text(child).includes("Save profile")).length)[0];
  await profileForm.props.onSubmit({ preventDefault() {} });
  tree = await app.settle();
  assert.ok(app.calls.some(call => call.operation === "rpc" && call.name === "update_people_discovery_settings" && call.payload.p_enabled === false));
  assert.match(app.text(tree), /Profile saved/);

  app.all(tree, node => node.type === "button" && app.text(node).trim() === "Preferences")[0].props.onClick();
  tree = app.render();
  const dark = app.all(tree, node => node.type === "button" && app.text(node).includes("Dark"))[0];
  dark.props.onClick();
  tree = await app.settle();
  assert.equal(app.all(tree, node => node.type === "button" && app.text(node).includes("Dark"))[0].props["aria-pressed"], true);
  assert.equal(app.storage.get("sidequest_theme_pref"), "dark");
  assert.equal(app.documentFixture.documentElement.dataset.theme, "dark");

  app.all(tree, node => node.type === "button" && app.text(node).trim() === "People")[0].props.onClick();
  tree = app.render();
  assert.match(app.text(tree), /Friend Fixture/);
  assert.match(app.text(tree), /Pending Fixture/);
  assert.match(app.text(tree), /Blocked Fixture/);
  const unblock = app.all(tree, node => node.type === "button" && app.text(node) === "Unblock")[0];
  await unblock.props.onClick();
  tree = await app.settle();
  assert.ok(app.calls.some(call => call.table === "friends" && call.operation === "delete"));
  assert.match(app.text(tree), /User unblocked/);
});

test("Settings ignores a delayed prior account, refreshes on auth change, and clears on sign-out", async () => {
  const delayedA = deferred();
  const app = fixture({
    session: { access_token: "a", user: { id: "a", email: "a@example.test" } },
    profileDeferredByUser: { a: delayedA },
    profiles: {
      a: { display_name: "Account A", username: "account-a", city: "A City" },
      b: { display_name: "Account B", username: "account-b", city: "B City" },
    },
  });
  app.render();
  await app.settle();
  app.emitAuth({ access_token: "b", user: { id: "b", email: "b@example.test" } });
  let tree = await app.settle();
  assert.match(app.text(tree), /@account-b/);
  delayedA.resolve({ data: { display_name: "Account A", username: "account-a", city: "A City" }, error: null });
  tree = await app.settle();
  assert.doesNotMatch(app.text(tree), /Account A|@account-a|A City/);
  assert.match(app.text(tree), /@account-b/);

  app.emitAuth(null);
  tree = await app.settle();
  assert.doesNotMatch(app.text(tree), /Account B|@account-b|B City|b@example\.test/);
  app.unmount();
});

test("Settings reports session failure without retaining account data", async () => {
  const app = fixture({ sessionError: { message: "Session unavailable" } });
  app.render();
  const tree = await app.settle();
  assert.match(app.text(tree), /Session unavailable/);
  assert.doesNotMatch(app.text(tree), /@rift|Fixture bio/);
});

test("Settings surfaces unblock failure and retains the blocked account row", async () => {
  const app = fixture({ deleteError: { message: "Unblock denied" } });
  app.render();
  let tree = await app.settle();
  app.all(tree, node => node.type === "button" && app.text(node).trim() === "People")[0].props.onClick();
  tree = app.render();
  await app.all(tree, node => node.type === "button" && app.text(node) === "Unblock")[0].props.onClick();
  tree = await app.settle();
  assert.match(app.text(tree), /Unblock denied/);
  assert.match(app.text(tree), /Blocked Fixture/);
});

test("an auth event synchronously invalidates a pending initial session before effect cleanup", async () => {
  const pendingSession = deferred();
  const app = fixture({
    initialSessionDeferred: pendingSession,
    session: { access_token: "a", user: { id: "a", email: "a@example.test" } },
    profiles: { a: { display_name: "Account A", username: "account-a" }, b: { display_name: "Account B", username: "account-b" } },
  });
  app.render();
  await app.runPendingEffects();
  app.emitAuth({ access_token: "b", user: { id: "b", email: "b@example.test" } });
  pendingSession.resolve({ data: { session: { access_token: "a", user: { id: "a", email: "a@example.test" } } }, error: null });
  let tree = await app.settle();
  assert.match(app.text(tree), /@account-b/);
  assert.doesNotMatch(app.text(tree), /@account-a|a@example\.test/);
});

test("same-user token refresh preserves the active account while A-B-A invalidates old epochs", async () => {
  const delayedA = deferred();
  const app = fixture({
    session: { access_token: "a1", user: { id: "a", email: "a@example.test" } },
    profileDeferredByUser: { a: delayedA },
    profiles: { a: { display_name: "Fresh A", username: "fresh-a" }, b: { display_name: "Account B", username: "account-b" } },
  });
  app.render(); await app.settle();
  app.emitAuth({ access_token: "a2", user: { id: "a", email: "a@example.test" } }, "TOKEN_REFRESHED");
  app.emitAuth({ access_token: "b", user: { id: "b", email: "b@example.test" } });
  app.emitAuth({ access_token: "a3", user: { id: "a", email: "a@example.test" } });
  delayedA.resolve({ data: { display_name: "Stale A", username: "stale-a" }, error: null });
  const tree = await app.settle();
  assert.doesNotMatch(app.text(tree), /@stale-a/);
});

test("stale Settings handlers do not dispatch mutations after account switch or sign-out", async () => {
  const pendingUpsert = deferred();
  const app = fixture({ upsertDeferred: pendingUpsert });
  app.render();
  let tree = await app.settle();
  const staleForm = app.all(tree, node => node.type === "form" && app.all(node, child => child.type === "button" && app.text(child).includes("Save profile")).length)[0];
  app.emitAuth({ access_token: "b", user: { id: "b", email: "b@example.test" } });
  await staleForm.props.onSubmit({ preventDefault() {} });
  assert.equal(app.calls.filter(call => call.operation === "upsert").length, 0);

  tree = await app.settle();
  const currentForm = app.all(tree, node => node.type === "form" && app.all(node, child => child.type === "button" && app.text(child).includes("Save profile")).length)[0];
  const saving = currentForm.props.onSubmit({ preventDefault() {} });
  app.emitAuth(null);
  pendingUpsert.resolve({ error: null });
  await saving;
  assert.equal(app.calls.filter(call => call.operation === "rpc" && call.name === "update_people_discovery_settings").length, 0);
});

test("feedback never dispatches with a token resolved after sign-out", async () => {
  const pendingToken = deferred();
  const app = fixture({ operationSessionDeferred: pendingToken });
  app.render();
  let tree = await app.settle();
  app.all(tree, node => node.type === "button" && app.text(node).includes("Suggest or report"))[0].props.onClick();
  tree = app.render();
  const feedbackForm = app.all(tree, node => node.type === "form" && app.text(node).includes("What happened or what would help"))[0];
  const sending = feedbackForm.props.onSubmit({ preventDefault() {} });
  app.emitAuth(null);
  pendingToken.resolve({ data: { session: { access_token: "stale-a", user: { id: "user", email: "fixture@example.test" } } }, error: null });
  await sending;
  assert.equal(app.calls.filter(call => call.operation === "fetch" && call.url === "/api/app-feedback").length, 0);
});

test("unmount invalidates a pending mutation before its next request", async () => {
  const pendingUpsert = deferred();
  const app = fixture({ upsertDeferred: pendingUpsert });
  app.render();
  const tree = await app.settle();
  const profileForm = app.all(tree, node => node.type === "form" && app.all(node, child => child.type === "button" && app.text(child).includes("Save profile")).length)[0];
  const saving = profileForm.props.onSubmit({ preventDefault() {} });
  for (let index = 0; index < 20 && !app.calls.some(call => call.operation === "upsert"); index += 1) await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.calls.filter(call => call.operation === "upsert").length, 1);
  app.unmount();
  pendingUpsert.resolve({ error: null });
  await saving;
  assert.equal(app.calls.filter(call => call.operation === "rpc" && call.name === "update_people_discovery_settings").length, 0);
});

test("a deferred current-photo acquisition cannot repaint account B", async () => {
  const pendingFetch = deferred();
  const app = fixture({ fetch: async () => pendingFetch.promise });
  app.render();
  let tree = await app.settle();
  const adjust = app.all(tree, node => node.type === "button" && app.text(node).trim() === "Adjust current photo")[0];
  const adjusting = adjust.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  app.emitAuth({ access_token: "b", user: { id: "b", email: "b@example.test" } });
  pendingFetch.resolve({ blob: async () => new Blob(["photo"], { type: "image/jpeg" }) });
  await adjusting;
  await new Promise(resolve => setImmediate(resolve));
  tree = app.render();
  assert.equal(app.createdObjectUrls.length, 0);
  assert.doesNotMatch(app.text(tree), /Could not load current photo/);
  assert.equal(app.all(tree, node => node.type === "button" && app.text(node).trim() === "Save photo").length, 0);
});

test("a deferred file normalization cannot repaint account B", async () => {
  const pendingNormalize = deferred();
  const app = fixture({ normalizedPhotoDeferred: pendingNormalize });
  app.render();
  let tree = await app.settle();
  const fileInput = app.all(tree, node => node.type === "input" && node.props.type === "file")[0];
  fileInput.props.onChange({ target: { files: [{ name: "a.jpg", type: "image/jpeg", size: 20 }], value: "a.jpg" } });
  app.emitAuth({ access_token: "b", user: { id: "b", email: "b@example.test" } });
  pendingNormalize.resolve({ name: "a.jpg", type: "image/jpeg", size: 20 });
  await new Promise(resolve => setImmediate(resolve));
  tree = app.render();
  assert.equal(app.createdObjectUrls.length, 0);
  assert.equal(app.all(tree, node => node.type === "button" && app.text(node).trim() === "Save photo").length, 0);
});

test("a canceled photo operation revokes the temporary object URL it created", async () => {
  let app;
  app = fixture({
    onCreateObjectURL() {
      app.emitAuth({ access_token: "b", user: { id: "b", email: "b@example.test" } });
    },
  });
  app.render();
  let tree = await app.settle();
  app.all(tree, node => node.type === "button" && app.text(node).trim() === "Adjust current photo")[0].props.onClick();
  for (let index = 0; index < 20 && app.revokedObjectUrls.length === 0; index += 1) await new Promise(resolve => setImmediate(resolve));
  app.render();
  assert.deepEqual(app.revokedObjectUrls, app.createdObjectUrls);
});

test("fresh session identity blocks stale profile and preferences dispatch before auth event", async () => {
  const sessionB = { access_token: "token-b", user: { id: "b", email: "b@example.test" } };
  const app = fixture();
  app.render();
  let tree = await app.settle();
  const profileForm = app.all(tree, node => node.type === "form" && app.all(node, child => child.type === "button" && app.text(child).includes("Save profile")).length)[0];
  app.setSessionSilently(sessionB);
  await profileForm.props.onSubmit({ preventDefault() {} });
  assert.equal(app.calls.filter(call => call.operation === "upsert" || call.operation === "rpc" || call.operation === "auth.updateUser").length, 0);

  app.emitAuth({ access_token: "fixture", user: { id: "user", email: "fixture@example.test" } });
  tree = await app.settle();
  app.all(tree, node => node.type === "button" && app.text(node).trim() === "Preferences")[0].props.onClick();
  tree = app.render();
  const preferencesForm = app.all(tree, node => node.type === "form" && app.all(node, child => child.type === "button" && app.text(child).includes("Save preferences")).length)[0];
  app.setSessionSilently(sessionB);
  await preferencesForm.props.onSubmit({ preventDefault() {} });
  assert.equal(app.calls.filter(call => call.operation === "auth.updateUser").length, 0);
});

test("fresh session identity blocks credential and lifecycle mutations before auth event", async () => {
  const sessionB = { access_token: "token-b", user: { id: "b", email: "b@example.test" } };
  const app = fixture({ confirm: true });
  app.render();
  let tree = await app.settle();

  app.all(tree, node => node.type === "button" && app.text(node).trim() === "Account")[0].props.onClick();
  tree = app.render();
  const emailForm = app.all(tree, node => node.type === "form" && app.text(node).includes("Change email"))[0];
  app.setSessionSilently(sessionB);
  await emailForm.props.onSubmit({ preventDefault() {} });
  assert.equal(app.calls.filter(call => call.operation === "auth.updateUser").length, 0);

  app.emitAuth({ access_token: "fixture", user: { id: "user", email: "fixture@example.test" } });
  tree = await app.settle();
  app.all(tree, node => node.type === "button" && app.text(node).trim() === "Account")[0].props.onClick();
  tree = app.render();
  const passwordForm = app.all(tree, node => node.type === "form" && app.text(node).includes("Update password"))[0];
  const passwordInputs = app.all(passwordForm, node => node.type === "input" && node.props.type === "password");
  passwordInputs[0].props.onChange({ target: { value: "old-password" } });
  passwordInputs[1].props.onChange({ target: { value: "new-password" } });
  passwordInputs[2].props.onChange({ target: { value: "new-password" } });
  tree = app.render();
  const filledPasswordForm = app.all(tree, node => node.type === "form" && app.text(node).includes("Update password"))[0];
  app.setSessionSilently(sessionB);
  await filledPasswordForm.props.onSubmit({ preventDefault() {} });
  assert.equal(app.calls.filter(call => call.operation === "auth.signInWithPassword" || call.operation === "auth.updateUser").length, 0);

  app.emitAuth({ access_token: "fixture", user: { id: "user", email: "fixture@example.test" } });
  tree = await app.settle();
  app.all(tree, node => node.type === "button" && app.text(node).trim() === "Account")[0].props.onClick();
  tree = app.render();
  app.setSessionSilently(sessionB);
  await app.all(tree, node => node.type === "button" && app.text(node).trim() === "Deactivate account")[0].props.onClick();
  assert.equal(app.calls.filter(call => call.operation === "rpc" && call.name === "deactivate_my_account").length, 0);
});

test("photo upload cannot reach auth metadata after an account switch", async () => {
  const pendingUpload = deferred();
  const app = fixture({ photoUploadDeferred: pendingUpload });
  app.render();
  let tree = await app.settle();
  const fileInput = app.all(tree, node => node.type === "input" && node.props.type === "file")[0];
  fileInput.props.onChange({ target: { files: [{ name: "synthetic.jpg", type: "image/jpeg", size: 64 }], value: "synthetic" } });
  await new Promise(resolve => setImmediate(resolve));
  tree = app.render();
  app.all(tree, node => node.type === "button" && app.text(node).trim() === "Save photo")[0].props.onClick();
  for (let index = 0; index < 20 && !app.calls.some(call => call.operation === "storage.upload"); index += 1) await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.calls.filter(call => call.operation === "storage.upload").length, 1);
  app.emitAuth({ access_token: "b", user: { id: "b", email: "b@example.test" } });
  pendingUpload.resolve({ error: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.calls.filter(call => call.operation === "auth.updateUser").length, 0);
});

test("a readable different-user session is rejected before feedback dispatch even before its auth event", async () => {
  const pendingToken = deferred();
  const app = fixture({ operationSessionDeferred: pendingToken });
  app.render();
  let tree = await app.settle();
  app.all(tree, node => node.type === "button" && app.text(node).includes("Suggest or report"))[0].props.onClick();
  tree = app.render();
  const feedbackForm = app.all(tree, node => node.type === "form" && app.text(node).includes("What happened or what would help"))[0];
  const sending = feedbackForm.props.onSubmit({ preventDefault() {} });
  pendingToken.resolve({ data: { session: { access_token: "token-b", user: { id: "b", email: "b@example.test" } } }, error: null });
  await sending;
  assert.equal(app.calls.filter(call => call.operation === "fetch" && call.url === "/api/app-feedback").length, 0);
});

test("auth identity change clears password and feedback drafts immediately", async () => {
  const app = fixture();
  app.render();
  let tree = await app.settle();
  app.all(tree, node => node.type === "button" && app.text(node).trim() === "Account")[0].props.onClick();
  tree = app.render();
  const passwords = app.all(tree, node => node.type === "input" && node.props.type === "password");
  passwords.forEach((input, index) => input.props.onChange({ target: { value: `synthetic-secret-${index}` } }));
  tree = app.render();
  app.all(tree, node => node.type === "button" && app.text(node).includes("Suggest or report"))[0].props.onClick();
  tree = app.render();
  const textarea = app.all(tree, node => node.type === "textarea")[0];
  textarea.props.onChange({ target: { value: "Synthetic feedback draft that must not cross accounts." } });
  app.emitAuth({ access_token: "b", user: { id: "b", email: "b@example.test" } });
  tree = app.render();
  assert.equal(app.all(tree, node => node.type === "textarea").length, 0, "feedback dialog closes and draft is discarded synchronously");
  tree = await app.settle();
  app.all(tree, node => node.type === "button" && app.text(node).trim() === "Account")[0].props.onClick();
  tree = app.render();
  assert.deepEqual(app.all(tree, node => node.type === "input" && node.props.type === "password").map(input => input.props.value), ["", "", ""]);
});

test("TikTok publish and feedback call sites use an account epoch before network dispatch", () => {
  const source = readFileSync(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8");
  assert.match(source, /async function shareVideoToTikTok[\s\S]*beginAccountOperation\(userId\)[\s\S]*getAccessToken\(operation\)[\s\S]*isCurrentAccountOperation\(operation\)[\s\S]*fetch\("\/api\/tiktok\/publish"/);
  assert.match(source, /async function submitAppFeedback[\s\S]*beginAccountOperation\(userId\)[\s\S]*getAccessToken\(operation\)[\s\S]*isCurrentAccountOperation\(operation\)[\s\S]*fetch\("\/api\/app-feedback"/);
  assert.match(source, /const auditToken = await getAccessToken\(operation\)[\s\S]*recordSecurityAudit\([\s\S]*auditToken/);
  assert.match(source, /async function permanentlyDeleteAccount[\s\S]*const session = await getValidatedSession\(operation\)[\s\S]*fetch\(`\$\{supabaseUrl\}\/functions\/v1\/account-deletion`/);
  assert.equal((source.match(/auth\.getSession\(/g) || []).length, 2, "only the account loader and validated-session helper may read raw sessions");
  assert.match(source, /clearAccountState[\s\S]*setOldPassword\(""\)[\s\S]*setNewPassword\(""\)[\s\S]*setConfirmPassword\(""\)/);
  assert.match(source, /clearAccountState[\s\S]*setTiktokVideo\(null\)[\s\S]*setTiktokCaption\(""\)[\s\S]*setTiktokPrivacyLevel\("SELF_ONLY"\)/);
  assert.match(source, /clearAccountState[\s\S]*setFeedbackMessage\(""\)[\s\S]*setFeedbackReplyContact\(""\)/);
  assert.match(source, /async function uploadProfilePhoto[\s\S]*beginAccountOperation\(userId\)[\s\S]*auth\.updateUser[\s\S]*isCurrentAccountOperation\(operation\)/);
});
