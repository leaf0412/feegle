import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { WritePrototypeSourceInput } from "../../src/index.js";
import { PrototypeGenerator } from "../../src/prototype/prototype-generator.js";

describe("PrototypeGenerator", () => {
  it("writes a Vite project configured for offline relative assets", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "feegle-prototype-"));
    const generator = new PrototypeGenerator();

    const input: WritePrototypeSourceInput = {
      outputDirectory: root,
      title: "Retry <failed> task & confirm \\${alert(1)} `",
      requirementText: "Failed tasks need a retry confirmation flow.\n<img src=x onerror=alert(1)>"
    };

    await generator.writeSource(input);

    const viteConfig = await fs.readFile(path.join(root, "vite.config.ts"), "utf8");
    const html = await fs.readFile(path.join(root, "index.html"), "utf8");
    const app = await fs.readFile(path.join(root, "src", "main.ts"), "utf8");

    expect(viteConfig).toContain("base: './'");
    expect(html).toContain("<title>Retry &lt;failed&gt; task &amp; confirm \\${alert(1)} `</title>");
    expect(html).toContain('<script type="module" src="/src/main.ts"></script>');
    expect(app).toContain("Failed tasks need a retry confirmation flow.");
    expect(app).toContain("\\n<img src=x onerror=alert(1)>");
    expect(app).toContain("此页面仅用于需求确认，不代表最终 UI 设计");
    expect(app).toContain('const prototypeTitle = "Retry <failed> task & confirm \\\\${alert(1)} `";');
    expect(app).toContain('id="prototype-title"');
    expect(app).toContain(
      'document.querySelector<HTMLHeadingElement>("#prototype-title")!.textContent = prototypeTitle;'
    );
    expect(app).toContain('id="requirement-text"');
    expect(app).toContain(
      'document.querySelector<HTMLPreElement>("#requirement-text")!.textContent = requirementText;'
    );
    expect(app).not.toContain('<pre style="white-space: pre-wrap;">${requirementText}</pre>');
    expect(app).toContain('id="retry-button"');
    expect(app).toContain('id="status-text"');
    expect(app).toContain('document.querySelector<HTMLButtonElement>("#retry-button")');
    expect(app).toContain('addEventListener("click"');
    expect(app).toContain('window.confirm("确认重新执行该任务？")');
    expect(app).toContain('document.querySelector<HTMLParagraphElement>("#status-text")!.textContent');
    expect(app).toContain("当前状态：重试中");
    expect(app).not.toContain("<h1>Retry");
    expect(app).not.toContain("fetch(");
    expect(app).not.toContain("XMLHttpRequest");
    expect(app).not.toMatch(/https?:\/\//);
  });
});
