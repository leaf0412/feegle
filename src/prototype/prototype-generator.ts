import fs from "node:fs/promises";
import path from "node:path";

export interface WritePrototypeSourceInput {
  outputDirectory: string;
  title: string;
  requirementText: string;
}

export class PrototypeGenerator {
  async writeSource(input: WritePrototypeSourceInput): Promise<void> {
    await fs.mkdir(path.join(input.outputDirectory, "src"), { recursive: true });
    await fs.writeFile(path.join(input.outputDirectory, "vite.config.ts"), this.viteConfig(), "utf8");
    await fs.writeFile(path.join(input.outputDirectory, "index.html"), this.indexHtml(input.title), "utf8");
    await fs.writeFile(path.join(input.outputDirectory, "src", "main.ts"), this.mainTs(input), "utf8");
  }

  private viteConfig(): string {
    return `import { defineConfig } from "vite";

export default defineConfig({
  base: './'
});
`;
  }

  private indexHtml(title: string): string {
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${this.escapeHtml(title)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;
  }

  private mainTs(input: WritePrototypeSourceInput): string {
    return `const prototypeTitle = ${JSON.stringify(input.title)};
const requirementText = ${JSON.stringify(input.requirementText)};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = \`
  <main style="font-family: system-ui, sans-serif; max-width: 960px; margin: 32px auto; line-height: 1.6;">
    <p style="padding: 8px 12px; background: #fff7ed; border: 1px solid #fed7aa;">
      此页面仅用于需求确认，不代表最终 UI 设计
    </p>
    <h1 id="prototype-title"></h1>
    <section>
      <h2>需求说明</h2>
      <pre id="requirement-text" style="white-space: pre-wrap;"></pre>
    </section>
    <section>
      <h2>交互演示</h2>
      <button id="retry-button">重试失败任务</button>
      <p id="status-text">当前状态：失败</p>
    </section>
  </main>
\`;

document.querySelector<HTMLHeadingElement>("#prototype-title")!.textContent = prototypeTitle;
document.querySelector<HTMLPreElement>("#requirement-text")!.textContent = requirementText;

document.querySelector<HTMLButtonElement>("#retry-button")!.addEventListener("click", () => {
  const confirmed = window.confirm("确认重新执行该任务？");
  if (confirmed) {
    document.querySelector<HTMLParagraphElement>("#status-text")!.textContent = "当前状态：重试中";
  }
});
`;
  }

  private escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }
}
