import {
  BaseCodeBlockPlugin,
  BaseCodeLinePlugin,
  BaseCodeSyntaxPlugin,
} from '@platejs/code-block';
import { all, createLowlight } from 'lowlight';

import {
  CodeBlockElementStatic,
  CodeLineElementStatic,
  CodeSyntaxLeafStatic,
} from '@/components/ui/code-block-node-static';

// 记录 lowlight 初始化耗时，lowlight(all) 会注册所有语言，成本较高
// eslint-disable-next-line no-console
console.time('[Plate][code] lowlight(all) init');
const lowlight = createLowlight(all);
// eslint-disable-next-line no-console
console.timeEnd('[Plate][code] lowlight(all) init');

export const BaseCodeBlockKit = [
  BaseCodeBlockPlugin.configure({
    node: { component: CodeBlockElementStatic },
    options: { lowlight },
  }),
  BaseCodeLinePlugin.withComponent(CodeLineElementStatic),
  BaseCodeSyntaxPlugin.withComponent(CodeSyntaxLeafStatic),
];
