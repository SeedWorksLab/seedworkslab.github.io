import assert from "node:assert/strict";
import test from "node:test";

function element(tag = "div") {
  return {
    tag, textContent: "", children: [], classList: { add() {}, remove() {} },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute() {},
    set innerHTML(_value) { throw new Error("Release notes must never use innerHTML"); },
  };
}

function texts(node) {
  return [node.textContent, ...node.children.flatMap(texts)].filter(Boolean);
}

for (const repo of ["Coconut", "Banana", "Cherry", "Grape"]) {
test(`${repo} changelog paginates, expands notes, excludes drafts, and renders inert text`, async () => {
  const originalFetch = globalThis.fetch;
  const nodes = new Map();
  const note = '<script>throw new Error("must not execute")</script>';
  const release = (tag, draft = false) => ({
    tag_name: tag, name: tag, draft, published_at: "2026-11-18T00:00:00Z", assets: [],
    html_url: `https://github.com/SeedWorksLab/${repo}/releases/tag/${tag}`,
    body: `## Release Notes\n<!-- seedworks:release-notes:start -->\n### Fixed\n\n${note}\n<!-- seedworks:release-notes:end -->\n## Downloads\nSHOULD_NOT_RENDER`,
  });
  const calls = [];
  globalThis.document = {
    body: { dataset: { appRepo: repo } },
    getElementById(id) {
      if (id === "readme-content") return null;
      if (!nodes.has(id)) nodes.set(id, element());
      return nodes.get(id);
    },
    querySelectorAll() { return []; },
    createElement: element,
  };
  globalThis.fetch = async (url) => {
    assert.ok(url.startsWith(`https://api.github.com/repos/SeedWorksLab/${repo}/releases?`));
    calls.push(url);
    return {
      ok: true,
      json: async () => url.endsWith("page=1")
        ? [release("v1.3.1"), ...Array.from({ length: 99 }, (_, i) => release(`draft-${i}`, true))]
        : [release("v1.3.0")],
    };
  };
  try {
    await import(`../assets/js/app-page.js?test=${repo}-${Date.now()}`);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 2);
    assert.match(calls[1], /page=2$/);
    const list = nodes.get("release-list");
    assert.equal(list.children.length, 2);
    assert.equal(list.children[0].tag, "details");
    assert.equal(list.children[0].children[0].tag, "summary");
    assert.equal(list.children[0].open, true);
    assert.equal(list.children[1].open, false);
    const rendered = texts(list);
    assert.ok(rendered.includes(note));
    assert.ok(rendered.includes("Fixed"));
    assert.ok(!rendered.some((text) => text.includes("SHOULD_NOT_RENDER") || text.includes("draft-")));
    assert.equal(nodes.get("latest-release-version").textContent, "v1.3.1");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.document;
  }
});
}
