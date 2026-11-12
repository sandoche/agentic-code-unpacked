import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadBrowser } from "../../../skills/xkcd/runtime/scripts/core.mjs";
import { validateStoryboard, makePrompts, renderComic, planComicTopics } from "../../../skills/xkcd/scripts/xkcd.mjs";

const context = {
  schemaVersion: 1,
  target: { kind: "docs", name: "billing", files: ["Billing.php"] },
  source: { head: "abc123", kind: "working-tree", dirty: true },
  files: [{ id: "billing", path: "Billing.php", content: "lock();\nlookup();\ncharge();" }],
  evidence: [{ id: "billing-head", fileId: "billing", side: "head", startLine: 1, endLine: 3 }],
  limitations: [],
};
const storyboard = () => ({
  schemaVersion: 1,
  title: "One charge, please",
  concept: "A guard serializes duplicate work.",
  evidence: ["billing-head"],
  characters: [
    { id: "guard", name: "Billing", role: "Serializes the request", evidence: ["billing-head"] },
  ],
  strips: [
    {
      id: "billing-lock",
      title: "At the billing door",
      limitation: "A local guard does not prove external payment success.",
      panels: [
        {
          id: "arrival",
          scene: "Two identical stick figures approach one door.",
          dialogue: [{ characterId: "guard", text: "One at a time." }],
          caption: "The request acquires a lock.",
          evidence: ["billing-head"],
        },
        {
          id: "lookup",
          scene: "One stick figure checks a ledger.",
          dialogue: [],
          caption: "Check whether work already completed.",
          evidence: ["billing-head"],
        },
        {
          id: "exit",
          scene: "The second figure leaves without paying twice.",
          dialogue: [{ characterId: "guard", text: "Already handled." }],
          caption: "Return the stored result.",
          evidence: ["billing-head"],
        },
      ],
    },
  ],
});
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

test("validates evidence, characters, panel bounds, and unique identifiers", () => {
  assert.equal(validateStoryboard(context, storyboard()).strips.length, 1);
  const badEvidence = storyboard();
  badEvidence.strips[0].panels[0].evidence = ["missing"];
  assert.throws(() => validateStoryboard(context, badEvidence), /Unknown evidence/);
  const badCharacter = storyboard();
  badCharacter.strips[0].panels[0].dialogue[0].characterId = "ghost";
  assert.throws(() => validateStoryboard(context, badCharacter), /Unknown character/);
  const onePanel = storyboard();
  onePanel.strips[0].panels.length = 1;
  assert.throws(() => validateStoryboard(context, onePanel), /2.*6/);
  const tooManyPanels = storyboard();
  tooManyPanels.strips[0].panels = Array.from({ length: 7 }, (_, i) => ({
    ...tooManyPanels.strips[0].panels[0],
    id: `panel-${i}`,
  }));
  assert.throws(() => validateStoryboard(context, tooManyPanels), /2.*6/);
  const tooManyStrips = storyboard();
  tooManyStrips.strips = Array.from({ length: 13 }, (_, i) => ({
    ...tooManyStrips.strips[0],
    id: `strip-${i}`,
  }));
  assert.throws(() => validateStoryboard(context, tooManyStrips), /1.*12/);
  const duplicated = storyboard();
  duplicated.strips[0].panels[1].id = "arrival";
  assert.throws(() => validateStoryboard(context, duplicated), /duplicate/i);
});

test("prompts are stable, require actual generative artwork, and change when the scene changes", () => {
  const first = makePrompts(storyboard());
  assert.deepEqual(first, makePrompts(storyboard()));
  assert.match(first.entries[0].prompt, /complete comic/i);
  assert.match(first.entries[0].prompt, /One at a time\./);
  assert.match(first.entries[0].prompt, /The request acquires a lock\./);
  assert.doesNotMatch(first.entries[0].prompt, /no lettering|added separately/i);
  assert.match(first.entries[0].prompt, /3 panels/);
  const changed = storyboard();
  changed.strips[0].panels[0].scene = "A guard closes the door.";
  assert.notEqual(first.entries[0].promptHash, makePrompts(changed).entries[0].promptHash);
});

test("missing artwork produces an explicit incomplete artifact rather than an imitation", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xkcd-missing-"));
  try {
    const manifest = await renderComic(context, storyboard(), dir);
    assert.equal(manifest.status, "incomplete");
    assert.equal(
      manifest.artifacts.some((item) => item.path.endsWith(".png")),
      false,
    );
    assert.match(
      await readFile(path.join(dir, "index.html"), "utf8"),
      /Generative artwork required/,
    );
    assert.match(
      await readFile(path.join(dir, "transcript.md"), "utf8"),
      /local guard does not prove/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects non-image artwork instead of embedding executable or corrupt content", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xkcd-image-"));
  try {
    const image = path.join(dir, "fake.png");
    await writeFile(image, '<svg onload="alert(1)"></svg>');
    await assert.rejects(
      renderComic(context, storyboard(), dir, { artwork: image }),
      /PNG, JPEG, or WebP/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("requires a complete and unambiguous panel-artwork mapping", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xkcd-mapping-"));
  try {
    await assert.rejects(
      renderComic(context, storyboard(), dir, {
        artwork: { "billing-lock": { panels: ["only-one.png"] } },
      }),
      /complete strip image/i,
    );
    const board = storyboard();
    board.strips.push({ ...structuredClone(board.strips[0]), id: "another-strip" });
    await assert.rejects(
      renderComic(context, board, dir, { artwork: "one-strip.png" }),
      /exactly one strip/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("complete image export is offline, escapes transcript text, preserves PNG bytes, and resumes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xkcd-browser-"));
  try {
    const image = path.join(dir, "model.png");
    await writeFile(image, png);
    const board = storyboard();
    board.strips[0].panels[0].dialogue[0].text = "</p><script>globalThis.pwned=1</script>";
    const manifest = await renderComic(context, board, dir, { artwork: image });
    assert.equal(manifest.status, "complete");
    const html = await readFile(path.join(dir, "index.html"), "utf8");
    assert.match(html, /data:image\/png;base64,/);
    assert.doesNotMatch(html, /<script>globalThis/);
    assert.match(html, /&lt;script&gt;/);
    const output = await readFile(path.join(dir, "comic-01.png"));
    assert.deepEqual(output.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.ok(output.equals(png));
    assert.equal(output.readUInt32BE(16), 1);
    assert.equal(output.readUInt32BE(20), 1);
    assert.doesNotMatch(html, /caption-grid|typeset separately/);
    const resumed = await renderComic(context, board, dir);
    assert.equal(resumed.status, "complete");
    const changed = structuredClone(board);
    changed.strips[0].panels[0].scene += " A new character arrives.";
    const stale = await renderComic(context, changed, dir);
    assert.equal(stale.status, "incomplete");
    assert.equal(
      stale.artifacts.some((item) => item.path === "comic-01.png"),
      false,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("all visible text participates in full comic fingerprints", () => {
  const board = storyboard(),
    before = makePrompts(board).entries[0].promptHash;
  for (const mutate of [
    (b) => (b.title += " changed"),
    (b) => (b.strips[0].title += " changed"),
    (b) => (b.characters[0].name += " changed"),
    (b) => (b.strips[0].panels[0].caption += " changed"),
    (b) => (b.strips[0].panels[0].dialogue[0].text += " changed"),
  ]) {
    const b = structuredClone(board);
    mutate(b);
    assert.notEqual(makePrompts(b).entries[0].promptHash, before);
  }
});
test("topic selection is evidence-backed, ranked, bounded, and reports shortfall", () => {
  const c = structuredClone(context);
  c.analysis = {
    topics: Array.from({ length: 8 }, (_, i) => ({
      id: "t" + i,
      title: "Topic " + i,
      summary: "Different flow " + i,
      priority: i === 7 ? "high" : "medium",
      evidenceIds: ["billing-head"],
    })),
  };
  const plan = planComicTopics(c);
  assert.equal(plan.generatedCount, 6);
  assert.equal(plan.topics[0].id, "t7");
  assert.equal(plan.panels, 3);
  assert.deepEqual(plan, planComicTopics(c));
  const explicit = planComicTopics(c, { count: 10, panels: 4 });
  assert.equal(explicit.generatedCount, 8);
  assert.match(explicit.limitations.join(" "), /10.*8|8.*10/);
  assert.throws(() => planComicTopics(c, { count: 0 }), /count/i);
  assert.throws(() => planComicTopics(c, { panels: 7 }), /panel/i);
  c.analysis.topics[0].evidenceIds = ["missing"];
  assert.throws(() => planComicTopics(c), /evidence/i);
});
test("schema2 can identify the analysis topic without forcing a caption overlay", () => {
  const c = structuredClone(context);
  c.analysis = { topics: [{ id: "flow" }] };
  const board = storyboard();
  board.schemaVersion = 2;
  board.strips[0].topicId = "flow";
  assert.equal(validateStoryboard(c, board), board);
  board.strips[0].topicId = "unknown";
  assert.throws(() => validateStoryboard(c, board), /topic/i);
});
test("dialogue changes invalidate resumed artwork and partial completions survive", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xkcd-partial-"));
  try {
    const image = path.join(dir, "model.png");
    await writeFile(image, png);
    const board = storyboard();
    board.strips.push({ ...structuredClone(board.strips[0]), id: "second-strip" });
    const first = await renderComic(context, board, dir, { artwork: { "billing-lock": image } });
    assert.equal(first.status, "incomplete");
    assert.ok((await readFile(path.join(dir, "comic-01.png"))).equals(png));
    const resumed = await renderComic(context, board, dir, { artwork: { "second-strip": image } });
    assert.equal(resumed.status, "complete");
    board.strips[0].panels[0].dialogue[0].text += " Revised";
    const changed = await renderComic(context, board, dir);
    assert.equal(changed.status, "incomplete");
    assert.ok(!changed.artifacts.some((a) => a.path === "comic-01.png"));
    assert.ok(changed.artifacts.some((a) => a.path === "comic-02.png"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  "gallery opens offline and supports keyboard transcript access without executing source",
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "xkcd-offline-"));
    let browser;
    try {
      const board = storyboard();
      board.strips[0].panels[0].dialogue[0].text = "<script>globalThis.pwned=1</script>";
      const image = path.join(dir, "model.png");
      await writeFile(image, png);
      await renderComic(context, board, dir, { artwork: image });
      browser = await loadBrowser();
      const page = await browser.newPage();
      const network = [];
      page.on("request", (request) => {
        if (/^https?:/.test(request.url())) network.push(request.url());
      });
      await page.route("**/*", (route) =>
        /^https?:/.test(route.request().url()) ? route.abort() : route.continue(),
      );
      await page.goto(pathToFileURL(path.join(dir, "index.html")).href);
      assert.equal(await page.locator(".strip-art").count(), 1);
      assert.equal(await page.locator(".transcript").evaluate((el) => el.open), false);
      await page.locator(".transcript summary").focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator(".transcript").evaluate((el) => el.open), true);
      assert.match(await page.locator(".transcript").innerText(), /globalThis.pwned/);
      assert.equal(await page.evaluate(() => globalThis.pwned), undefined);
      assert.deepEqual(network, []);
    } finally {
      await browser?.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test("automatic topics skip generic verification without losing substantive verification algorithms", () => {
  const c = structuredClone(context);
  c.analysis = {
    topics: [
      {
        id: "verification",
        title: "What the tests establish",
        summary: "Fixture coverage",
        evidenceIds: ["billing-head"],
      },
      {
        id: "signature-flow",
        title: "Signature verification",
        summary: "Reject invalid signatures before charging",
        evidenceIds: ["billing-head"],
      },
    ],
  };
  const plan = planComicTopics(c);
  assert.deepEqual(
    plan.topics.map((t) => t.id),
    ["signature-flow"],
  );
});

test(
  "JPEG export preserves model dimensions with pixels-only PNG conversion",
  { timeout: 60000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "xkcd-jpeg-"));
    let browser;
    try {
      browser = await loadBrowser();
      const page = await browser.newPage();
      const jpeg = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 9;
        canvas.height = 5;
        canvas.getContext("2d").fillRect(0, 0, 9, 5);
        return canvas.toDataURL("image/jpeg").split(",")[1];
      });
      await browser.close();
      browser = undefined;
      const image = path.join(dir, "model.jpg");
      await writeFile(image, Buffer.from(jpeg, "base64"));
      const result = await renderComic(context, storyboard(), dir, { artwork: image });
      assert.equal(result.status, "complete");
      const output = await readFile(path.join(dir, "comic-01.png"));
      assert.equal(output.readUInt32BE(16), 9);
      assert.equal(output.readUInt32BE(20), 5);
      const exports = JSON.parse(await readFile(path.join(dir, "exports.json"), "utf8"));
      assert.equal(exports.images[0].conversion, "pixels-only-png");
      assert.equal(exports.images[0].width, 9);
    } finally {
      await browser?.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test("reducing strip count removes obsolete exports while preserving generated source artwork", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xkcd-reduce-"));
  try {
    const image = path.join(dir, "model.png");
    await writeFile(image, png);
    const board = storyboard();
    board.strips.push({ ...structuredClone(board.strips[0]), id: "second-strip" });
    await renderComic(context, board, dir, {
      artwork: { "billing-lock": image, "second-strip": image },
    });
    const before = JSON.parse(await readFile(path.join(dir, "prompts.json"), "utf8"));
    await renderComic(context, storyboard(), dir);
    await assert.rejects(readFile(path.join(dir, "comic-02.png")), /ENOENT/);
    assert.ok((await readFile(path.join(dir, before.entries[1].artwork[0].path))).equals(png));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
