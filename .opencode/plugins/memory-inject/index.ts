import { Plugin } from "@opencode/plugin"

// يحقن ذاكرة نبراس تلقائياً في كل رسالة — بلا استدعاء أدوات، بلا انتظار.
export default Plugin.define({
  id: "memory-inject",
  async setup(ctx) {
    await ctx.session.hook("prompt", (event) => {
      const dir = ctx.location.directory.replace(/\\/g, "/");
      const encoded = dir.split("/").map(encodeURIComponent).join("/");
      const prefix = encoded.startsWith("/") ? "file://" : "file:///";
      event.prompt.files ??= [];
      event.prompt.files.push({ uri: prefix + encoded + "/MEMORY.md" });
      event.prompt.files.push({ uri: prefix + encoded + "/USER.md" });
    });
  },
})
