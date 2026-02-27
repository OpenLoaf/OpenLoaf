/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { EventEmitter } from "events";
import type { OfficeCommand } from "@/modules/office/officeTypes";

class OfficeEventBus extends EventEmitter {
  emitCommand(command: OfficeCommand) {
    this.emit("command", command);
  }

  onCommand(listener: (command: OfficeCommand) => void) {
    this.on("command", listener);
    return () => {
      this.off("command", listener);
    };
  }
}

export const officeEventBus = new OfficeEventBus();

export function publishOfficeCommand(command: OfficeCommand) {
  officeEventBus.emitCommand(command);
}
