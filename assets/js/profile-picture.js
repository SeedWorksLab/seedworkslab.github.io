import { AccountError } from "./account-core.js";

export const PICTURE_SIZE = 256;
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_PICTURE_BYTES = 256 * 1024;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function validatePictureFile(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new AccountError("Choose a JPEG, PNG or WebP image.");
  }
  if (!file.size || file.size > MAX_SOURCE_BYTES) {
    throw new AccountError("Choose an image no larger than 10 MB.");
  }
}

export function cropRectangle(width, height, zoom = 1, x = 50, y = 50) {
  const size = Math.min(width, height) / clamp(zoom, 1, 3);
  return { size, x: (width - size) * clamp(x, 0, 100) / 100, y: (height - size) * clamp(y, 0, 100) / 100 };
}

// Pointer deltas are CSS pixels; crop coordinates are source-image pixels.
export function panCrop(width, height, crop, dx, dy, displaySize) {
  if (displaySize <= 0) return crop;
  const rect = cropRectangle(width, height, crop.zoom, crop.x, crop.y);
  const x = clamp(rect.x - dx * rect.size / displaySize, 0, width - rect.size);
  const y = clamp(rect.y - dy * rect.size / displaySize, 0, height - rect.size);
  return {
    ...crop,
    x: width > rect.size ? x / (width - rect.size) * 100 : 50,
    y: height > rect.size ? y / (height - rect.size) * 100 : 50,
  };
}

export function createPictureService(client) {
  return {
    async load() {
      const { data, error } = await client.schema("public").rpc("seed_get_profile_picture");
      if (error) throw new AccountError("Could not load your profile picture.");
      return typeof data === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)
        && data.length <= 349550 ? data : null;
    },
    async save(dataUrl) {
      const { error } = await client.schema("public").rpc("seed_set_profile_picture", {
        p_png: dataUrl === null ? null : dataUrl.split(",")[1],
      });
      if (error) throw new AccountError("Could not save your profile picture. Please try again.");
    },
  };
}

function pictureBlob(dataUrl) {
  const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

export function bindProfilePicture(client, { userId, notify }) {
  const node = (id) => document.getElementById(id);
  const service = createPictureService(client);
  const dialog = node("picture-dialog");
  const form = node("picture-form");
  const photo = node("account-picture");
  const fallback = node("account-picture-fallback");
  const menuImage = node("picture-menu-image");
  const editor = node("picture-editor");
  const canvas = node("picture-preview");
  const input = node("picture-file");
  const zoom = node("picture-zoom");
  const saveButton = node("picture-save");
  let bitmap = null;
  let storedPicture = null;
  let generation = 0;
  let busy = false;
  let decoding = false;
  let drag = null;
  let crop = { zoom: 1, x: 50, y: 50 };

  function status(message = "") {
    node("picture-status").textContent = message;
    node("picture-status").hidden = !message;
  }

  function stopDrag() {
    if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    canvas.classList.remove("is-dragging");
  }

  function clearEditor() {
    ++generation;
    stopDrag();
    bitmap?.close();
    bitmap = null;
    decoding = false;
    input.value = "";
    editor.hidden = true;
    node("picture-upload-empty").hidden = false;
    node("picture-existing-hint").hidden = true;
    node("picture-choose").textContent = "Upload photo";
    saveButton.disabled = true;
    canvas.getContext("2d").clearRect(0, 0, PICTURE_SIZE, PICTURE_SIZE);
  }

  function render(data) {
    storedPicture = data;
    fallback.hidden = !!data;
    for (const image of [photo, menuImage]) {
      image.hidden = !data;
      if (data) image.src = data;
      else image.removeAttribute("src");
    }
  }

  function screen(name) {
    node("picture-menu").hidden = name !== "menu";
    form.hidden = name !== "editor";
    node("picture-delete-confirm").hidden = name !== "delete";
    node("picture-dialog-title").textContent = name === "editor"
      ? (storedPicture ? "Edit picture" : "Add profile picture") : "Profile picture";
    status();
  }

  function close() {
    dialog.close();
    clearEditor();
    status();
  }

  function draw() {
    if (!bitmap) return;
    const rect = cropRectangle(bitmap.width, bitmap.height, crop.zoom, crop.x, crop.y);
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, PICTURE_SIZE, PICTURE_SIZE);
    context.drawImage(bitmap, rect.x, rect.y, rect.size, rect.size, 0, 0, PICTURE_SIZE, PICTURE_SIZE);
    zoom.value = String(crop.zoom);
  }

  async function decode(blob, existing = false) {
    const request = ++generation;
    const id = userId();
    decoding = true;
    saveButton.disabled = true;
    status("Loading picture…");
    try {
      const decoded = await createImageBitmap(blob);
      if (request !== generation || id !== userId()) { decoded.close(); return; }
      if (decoded.width * decoded.height > 40000000) {
        decoded.close();
        throw new AccountError("Choose an image with no more than 40 megapixels.");
      }
      stopDrag();
      bitmap?.close();
      bitmap = decoded;
      crop = { zoom: 1, x: 50, y: 50 };
      editor.hidden = false;
      node("picture-upload-empty").hidden = true;
      node("picture-existing-hint").hidden = !existing;
      node("picture-choose").textContent = "Change photo";
      status();
      draw();
      canvas.focus();
    } catch (error) {
      if (request === generation && id === userId()) {
        status(error instanceof AccountError ? error.message : "Could not read that image.");
      }
    } finally {
      if (request === generation) {
        decoding = false;
        saveButton.disabled = !bitmap;
      }
    }
  }

  function edit() {
    clearEditor();
    screen("editor");
    if (storedPicture) void decode(pictureBlob(storedPicture), true);
    else node("picture-choose").focus();
  }

  node("picture-open").addEventListener("click", () => {
    if (busy || !userId()) return;
    if (storedPicture) screen("menu");
    else edit();
    if (!dialog.open) dialog.showModal();
    node(storedPicture ? "picture-edit" : "picture-choose").focus();
  });
  node("picture-edit").addEventListener("click", edit);
  node("picture-choose").addEventListener("click", () => {
    if (!busy) input.click();
  });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file || busy) return;
    try {
      validatePictureFile(file);
      await decode(file);
    } catch (error) {
      status(error.message);
    }
  });
  node("picture-close").addEventListener("click", () => { if (!busy) close(); });
  node("picture-cancel").addEventListener("click", () => { if (!busy) close(); });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (!busy) close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button:not([disabled]), input:not([disabled]), [tabindex='0']")]
      .filter((control) => control.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    clearEditor();
    node("picture-open").focus();
  });
  node("picture-remove").addEventListener("click", () => {
    screen("delete");
    node("picture-delete-cancel").focus();
  });
  node("picture-delete-cancel").addEventListener("click", () => screen("menu"));
  node("picture-reset").addEventListener("click", () => {
    if (busy || decoding) return;
    crop = { zoom: 1, x: 50, y: 50 };
    draw();
  });
  zoom.addEventListener("input", () => {
    if (busy || decoding) return;
    stopDrag();
    crop.zoom = clamp(Number(zoom.value), 1, 3);
    draw();
  });

  function pan(dx, dy) {
    if (!bitmap || busy || decoding) return;
    crop = panCrop(bitmap.width, bitmap.height, crop, dx, dy, canvas.getBoundingClientRect().width);
    draw();
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (!bitmap || busy || decoding || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    canvas.focus();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    pan(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(event, stopDrag);
  }
  canvas.addEventListener("keydown", (event) => {
    const deltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!deltas[event.key] || !bitmap) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 2;
    pan(...deltas[event.key].map((delta) => delta * step));
  });

  async function save(data) {
    if (busy || !userId()) return;
    busy = true;
    stopDrag();
    const request = ++generation;
    const id = userId();
    dialog.setAttribute("aria-busy", "true");
    dialog.querySelectorAll("input, button").forEach((control) => { control.disabled = true; });
    status(data ? "Saving picture…" : "Deleting picture…");
    try {
      await service.save(data);
      if (id !== userId() || request !== generation) return;
      render(data);
      close();
      notify(data ? "Profile picture saved." : "Profile picture removed.", "success");
    } catch (error) {
      if (id === userId() && request === generation) status(error.message);
    } finally {
      busy = false;
      dialog.setAttribute("aria-busy", "false");
      dialog.querySelectorAll("input, button").forEach((control) => { control.disabled = false; });
      saveButton.disabled = !bitmap || decoding;
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!bitmap || busy || decoding) return;
    const data = canvas.toDataURL("image/png");
    if (atob(data.split(",")[1]).length > MAX_PICTURE_BYTES) {
      status("This crop is too detailed. Try a simpler image.");
      return;
    }
    void save(data);
  });
  node("picture-delete").addEventListener("click", () => { void save(null); });
  photo.addEventListener("error", () => render(null));
  return {
    clear() { close(); render(null); },
    async refresh() {
      const id = userId();
      const request = generation;
      try {
        const data = await service.load();
        if (id === userId() && request === generation && !busy && !dialog.open) render(data);
      } catch (error) {
        if (id === userId() && request === generation) notify(error.message, "error");
      }
    },
  };
}
