/**
 * jsxCreateValidator tests.
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/jsxCreateValidator.test.ts
 */
import assert from "node:assert/strict";
import { validateJsxCreateInput } from "@/ai/tools/jsxCreateValidator";

/** Assert that the validator accepts valid JSX. */
function expectPass(label: string, input: string) {
  try {
    validateJsxCreateInput(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.fail(`[${label}] should pass but failed: ${message}`);
  }
}

/** Assert that the validator rejects invalid JSX. */
function expectFail(label: string, input: string, includes?: string) {
  let thrown: unknown = null;
  try {
    validateJsxCreateInput(input);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, `[${label}] should fail but passed`);
  if (includes) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    assert.ok(
      message.includes(includes),
      `[${label}] error should include "${includes}"`,
    );
  }
}

/** Run jsxCreateValidator test cases. */
function main() {
  expectPass("allows expressions", "<div>{1 + 2}</div>");
  expectPass(
    "allows map",
    '<ul>{["Mon", "Tue"].map((day) => (<li>{day}</li>))}</ul>',
  );
  expectPass("allows style", '<div style={{ color: "red", padding: 4 }} />');

  expectFail("empty input", "   ", "JSX 内容为空");
  expectFail("non jsx root", "1 + 1", "仅支持单个 JSX 根节点");
  expectFail("spread attribute", "<div {...props} />", "不支持 `{...}` 属性展开");

  console.log("PASS jsxCreateValidator");
}

main();
