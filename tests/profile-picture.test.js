import assert from "node:assert/strict";
import test from "node:test";
import {
  cropRectangle,
  panCrop,
  bindProfilePicture,
  createPictureService,
  MAX_SOURCE_BYTES,
  validatePictureFile,
} from "../assets/js/profile-picture.js";

test("only bounded JPEG, PNG and WebP sources are accepted", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.doesNotThrow(() => validatePictureFile({ type, size: MAX_SOURCE_BYTES }));
  }
  for (const file of [null, { type: "image/svg+xml", size: 10 },
    { type: "image/gif", size: 10 }, { type: "image/png", size: 0 },
    { type: "image/png", size: MAX_SOURCE_BYTES + 1 }]) {
    assert.throws(() => validatePictureFile(file));
  }
});

test("square crop centers landscape and portrait images without stretching", () => {
  assert.deepEqual(cropRectangle(800, 400), { size: 400, x: 200, y: 0 });
  assert.deepEqual(cropRectangle(400, 800), { size: 400, x: 0, y: 200 });
  assert.deepEqual(cropRectangle(400, 400, 2, 100, 0), { size: 200, x: 200, y: 0 });
  assert.deepEqual(cropRectangle(600, 300, 0, -10, 110), { size: 300, x: 0, y: 0 });
});

function mockService(result) {
  const calls = [];
  const service = createPictureService({
    schema(name) {
      assert.equal(name, "public");
      return { async rpc(...args) { calls.push(args); return result; } };
    },
  });
  return { service, calls };
}

test("load accepts only bounded PNG data URIs, not arbitrary URLs", async () => {
  for (const value of [null, "https://example.com/tracking.png", "data:image/svg+xml;base64,AAAA",
    `data:image/png;base64,${"A".repeat(349551)}`]) {
    assert.equal(await mockService({ data: value }).service.load(), null);
  }
  assert.equal(await mockService({ data: "data:image/png;base64,AAAA" }).service.load(),
    "data:image/png;base64,AAAA");
});

test("save and remove use only the central picture RPC", async () => {
  const { service, calls } = mockService({});
  await service.save("data:image/png;base64,AAAA");
  await service.save(null);
  assert.deepEqual(calls, [
    ["seed_set_profile_picture", { p_png: "AAAA" }],
    ["seed_set_profile_picture", { p_png: null }],
  ]);
});

test("load/save errors are surfaced instead of reporting success", async () => {
  const { service } = mockService({ error: new Error("denied") });
  await assert.rejects(service.load(), /Could not load/);
  await assert.rejects(service.save(null), /Could not save/);
});

test("dragging uses display scale, stays within the photo and handles square photos", () => {
  const crop = { zoom: 1, x: 50, y: 50 };
  assert.deepEqual(panCrop(800, 400, crop, 64, 0, 256), { zoom: 1, x: 25, y: 50 });
  assert.deepEqual(panCrop(800, 400, crop, 128, 0, 512), { zoom: 1, x: 25, y: 50 });
  assert.deepEqual(panCrop(800, 400, crop, -9999, 9999, 256), { zoom: 1, x: 100, y: 50 });
  assert.deepEqual(panCrop(400, 400, crop, 50, 50, 256), crop);
  assert.deepEqual(panCrop(400, 400, { zoom: 2, x: 50, y: 50 }, 64, -64, 256),
    { zoom: 2, x: 25, y: 75 });
  assert.deepEqual(panCrop(800, 400, crop, 50, 50, 0), crop);
});

function pictureHarness() {
  const nodes = new Map();
  const draws = [];
  let focused;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      value: "",
      open: false,
      hidden: false,
      listeners: {},
      captured: new Set(),
      classList: { add() {}, remove() {} },
      addEventListener(name, handler) { this.listeners[name] = handler; },
      setAttribute() {},
      removeAttribute(name) { delete this[name]; },
      querySelectorAll() { return []; },
      showModal() { this.open = true; },
      close() { if (this.open) { this.open = false; this.listeners.close?.(); } },
      focus() { focused = id; },
      click() { this.listeners.click?.(); },
      setPointerCapture(id) { this.captured.add(id); },
      hasPointerCapture(id) { return this.captured.has(id); },
      releasePointerCapture(id) { this.captured.delete(id); },
      getBoundingClientRect() { return { width: 256 }; },
      getContext() { return { clearRect() {}, drawImage(...args) { draws.push(args); } }; },
      toDataURL(type) { assert.equal(type, "image/png"); return "data:image/png;base64,AAAA"; },
    });
    return nodes.get(id);
  }
  const originalDocument = globalThis.document;
  const originalDecoder = globalThis.createImageBitmap;
  let closed = 0;
  let account = "first";
  const calls = [];
  const messages = [];
  let resolveLoad;
  let saveResult = async () => ({});
  globalThis.document = { getElementById: node };
  globalThis.createImageBitmap = async () => ({
    width: 800, height: 400, close() { ++closed; },
  });
  const client = {
    schema() {
      return {
        async rpc(name, args) {
          calls.push([name, args]);
          if (name === "seed_get_profile_picture") {
            return new Promise((resolve) => { resolveLoad = resolve; });
          }
          return saveResult();
        },
      };
    },
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const view = bindProfilePicture(client, {
    userId: () => account,
    notify: (...args) => messages.push(args),
  });
  return {
    view, node, draws, calls, messages, tick,
    get focused() { return focused; },
    get closed() { return closed; },
    set account(value) { account = value; },
    set saveResult(value) { saveResult = value; },
    resolveLoad(value) { resolveLoad(value); },
    async upload() {
      node("picture-file").files = [{ type: "image/jpeg", size: 123 }];
      await node("picture-file").listeners.change();
    },
    cleanup() {
      if (originalDocument === undefined) delete globalThis.document;
      else globalThis.document = originalDocument;
      if (originalDecoder === undefined) delete globalThis.createImageBitmap;
      else globalThis.createImageBitmap = originalDecoder;
    },
  };
}

test("avatar opens add/edit dialog, dragging previews processed pixels, deletion requires confirmation", async () => {
  const harness = pictureHarness();
  const { view, node, draws, calls, messages, tick } = harness;
  try {
    view.clear();
    assert.equal(node("account-picture").hidden, true);
    node("picture-open").click();
    assert.equal(node("picture-dialog").open, true);
    assert.equal(node("picture-form").hidden, false);
    assert.equal(node("picture-menu").hidden, true);
    assert.equal(node("picture-dialog-title").textContent, "Add profile picture");
    assert.equal(harness.focused, "picture-choose");
    await harness.upload();
    assert.equal(node("picture-editor").hidden, false);
    assert.deepEqual(draws.at(-1).slice(1), [200, 0, 400, 400, 0, 0, 256, 256]);
    const canvas = node("picture-preview");
    canvas.listeners.pointerdown({ isPrimary: true, button: 0, pointerId: 1, clientX: 0, clientY: 0, preventDefault() {} });
    canvas.listeners.pointermove({ pointerId: 1, clientX: 64, clientY: 0 });
    assert.equal(draws.at(-1)[1], 100, "photo follows the pointer");
    canvas.listeners.pointerup();
    assert.equal(canvas.captured.size, 0);
    canvas.listeners.keydown({ key: "ArrowLeft", preventDefault() {} });
    assert.ok(draws.at(-1)[1] > 100, "keyboard can adjust the crop");
    node("picture-reset").click();
    assert.equal(draws.at(-1)[1], 200);
    node("picture-form").listeners.submit({ preventDefault() {} });
    await tick();
    assert.deepEqual(calls.at(-1), ["seed_set_profile_picture", { p_png: "AAAA" }]);
    assert.equal(node("account-picture").src, "data:image/png;base64,AAAA");
    assert.equal(node("picture-editor").hidden, true);
    assert.equal(harness.closed, 1);
    assert.equal(node("picture-dialog").open, false);
    assert.deepEqual(messages.at(-1), ["Profile picture saved.", "success"]);
    node("picture-open").click();
    assert.equal(node("picture-menu").hidden, false);
    assert.equal(node("picture-menu-image").src, "data:image/png;base64,AAAA");
    node("picture-edit").click();
    await tick();
    assert.equal(node("picture-form").hidden, false);
    assert.equal(node("picture-editor").hidden, false, "existing photo can be edited");
    node("picture-cancel").click();
    assert.equal(node("account-picture").hidden, false, "cancel preserves the saved photo");
    node("picture-open").click();
    node("picture-remove").click();
    assert.equal(node("picture-delete-confirm").hidden, false);
    assert.equal(calls.filter(([name]) => name === "seed_set_profile_picture").length, 1);
    node("picture-delete-cancel").click();
    assert.equal(node("picture-menu").hidden, false);
    node("picture-remove").click();
    node("picture-delete").click();
    await tick();
    assert.deepEqual(calls.at(-1), ["seed_set_profile_picture", { p_png: null }]);
    assert.equal(node("account-picture").hidden, true);
    const pending = view.refresh();
    harness.account = "second";
    view.clear();
    harness.resolveLoad({ data: "data:image/png;base64,AAAA" });
    await pending;
    assert.equal(node("account-picture").hidden, true);
    assert.equal(node("account-picture").src, undefined);
  } finally {
    harness.cleanup();
  }
});

test("save failures stay in the editor; duplicate saves and Escape are blocked during requests", async () => {
  const harness = pictureHarness();
  const { node, calls, tick } = harness;
  let complete;
  harness.saveResult = () => new Promise((resolve) => { complete = resolve; });
  try {
    node("picture-open").click();
    await harness.upload();
    node("picture-form").listeners.submit({ preventDefault() {} });
    node("picture-form").listeners.submit({ preventDefault() {} });
    assert.equal(calls.length, 1);
    let prevented = false;
    node("picture-dialog").listeners.cancel({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(node("picture-dialog").open, true);
    complete({ error: new Error("denied") });
    await tick();
    assert.equal(node("picture-dialog").open, true);
    assert.match(node("picture-status").textContent, /Could not save/);
    assert.equal(node("picture-save").disabled, false);
    node("picture-dialog").listeners.cancel({ preventDefault() {} });
    assert.equal(node("picture-dialog").open, false);
    assert.equal(harness.closed, 1);
    assert.equal(node("account-picture").src, undefined);
  } finally {
    harness.cleanup();
  }
});

test("closing the dialog discards a photo that finishes decoding later", async () => {
  const harness = pictureHarness();
  let decoded;
  let released = false;
  globalThis.createImageBitmap = () => new Promise((resolve) => { decoded = resolve; });
  try {
    harness.node("picture-open").click();
    const upload = harness.upload();
    harness.node("picture-close").click();
    decoded({ width: 800, height: 400, close() { released = true; } });
    await upload;
    assert.equal(released, true);
    assert.equal(harness.node("picture-dialog").open, false);
    assert.equal(harness.node("picture-editor").hidden, true);
    assert.equal(harness.node("picture-save").disabled, true);
    assert.equal(harness.calls.length, 0);
  } finally {
    harness.cleanup();
  }
});

test("an account switch closes the dialog and ignores a late save result", async () => {
  const harness = pictureHarness();
  let complete;
  harness.saveResult = () => new Promise((resolve) => { complete = resolve; });
  try {
    harness.node("picture-open").click();
    await harness.upload();
    harness.node("picture-form").listeners.submit({ preventDefault() {} });
    harness.account = "another-user";
    harness.view.clear();
    complete({});
    await harness.tick();
    assert.equal(harness.node("picture-dialog").open, false);
    assert.equal(harness.node("account-picture").hidden, true);
    assert.equal(harness.node("account-picture").src, undefined);
    assert.equal(harness.messages.length, 0);
  } finally {
    harness.cleanup();
  }
});
