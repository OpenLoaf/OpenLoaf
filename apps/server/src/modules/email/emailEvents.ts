import { EventEmitter } from 'events'

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
