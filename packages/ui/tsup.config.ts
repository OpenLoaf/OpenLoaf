import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
);
const externalDeps = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {})
];

const externalAlias = {
  name: "external-alias",
  setup(build: {
    onResolve: (
      options: { filter: RegExp },
      callback: (args: { path: string }) => { path: string; external: boolean }
    ) => void;
  }) {
    build.onResolve({ filter: /^@\// }, (args) => {
      return { path: args.path, external: true };
    });
  }
};

export default defineConfig({
  entry: ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.d.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: externalDeps,
  esbuildPlugins: [externalAlias],
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  }
});
