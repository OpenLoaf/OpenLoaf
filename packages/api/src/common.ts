/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
// 注意：这里不能写 `./common`，否则会解析回本文件（common.ts）形成自引用，导致导出为空。
export * from "./common/index";
