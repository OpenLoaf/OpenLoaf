import prisma from '@openloaf/db'

async function main() {
  const mailboxCount = await prisma.emailMailbox.count()
  const messageCount = await prisma.emailMessage.count()
  console.log('EmailMailbox count:', mailboxCount)
  console.log('EmailMessage count:', messageCount)
  
  if (mailboxCount > 0) {
    const mailboxes = await prisma.emailMailbox.findMany()
    console.log('Mailboxes:', JSON.stringify(mailboxes, null, 2))
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
