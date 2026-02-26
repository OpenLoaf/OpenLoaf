/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { EventEmitter } from 'events'

export type EmailNewMailEvent = {
  workspaceId: string
  accountEmail: string
  mailboxPath: string
}

class EmailEventBus extends EventEmitter {
  emitNewMail(event: EmailNewMailEvent) {
    this.emit('newMail', event)
  }

  onNewMail(listener: (event: EmailNewMailEvent) => void) {
    this.on('newMail', listener)
    return () => {
      this.off('newMail', listener)
    }
  }
}

export const emailEventBus = new EmailEventBus()
