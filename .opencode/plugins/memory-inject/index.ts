import { Plugin } from "@opencode/plugin"

// يحقن ذاكرة نبراس تلقائياً في كل رسالة — بلا استدعاء أدوات، بلا انتظار.
export default Plugin.define({
  id: "memory-inject",
  async setup(ctx) {
    await ctx.session.hook("prompt", (event) => {
      const base = ctx.location.directory.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");
      event.prompt.files ??= [];
      event.prompt.files.push({ uri: "file:///" + base + "/MEMORY.md" });
      event.prompt.files.push({ uri: "file:///" + base + "/USER.md" });
    });
  },
})
