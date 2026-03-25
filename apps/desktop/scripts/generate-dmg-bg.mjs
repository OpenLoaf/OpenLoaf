/**
 * Generate DMG background image (540x380 @2x = 1080x760)
 * Shows "Welcome to OpenLoaf" text with a dashed arrow between app and Applications positions
 */
import { createCanvas } from '@napi-rs/canvas'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SCALE = 2
const W = 540 * SCALE
const H = 380 * SCALE

const canvas = createCanvas(W, H)
const ctx = canvas.getContext('2d')

// Background — white
ctx.fillStyle = '#ffffff'
ctx.fillRect(0, 0, W, H)

// Measure text widths first (no drawing)
const fontNormal = `${26 * SCALE}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`
const fontBold = `bold ${26 * SCALE}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`

ctx.font = fontNormal
const welcomeWidth = ctx.measureText('Welcome to ').width
ctx.font = fontBold
const openloafWidth = ctx.measureText('OpenLoaf').width

const totalWidth = welcomeWidth + openloafWidth
const startX = (W - totalWidth) / 2

// Draw "Welcome to "
ctx.fillStyle = '#333333'
ctx.font = fontNormal
ctx.textAlign = 'left'
ctx.fillText('Welcome to ', startX, 80 * SCALE)

// Draw "OpenLoaf" in brand color
ctx.fillStyle = '#F97316'
ctx.font = fontBold
ctx.fillText('OpenLoaf', startX + welcomeWidth, 80 * SCALE)

// Subtitle
ctx.fillStyle = '#999999'
ctx.font = `${13 * SCALE}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`
ctx.textAlign = 'center'
ctx.fillText('AI desktop assistant for everyone.', W / 2, 110 * SCALE)

// Dashed arrow between icon positions (150,240) and (390,240) in 1x coords
const arrowY = 230 * SCALE
const arrowStartX = 210 * SCALE
const arrowEndX = 340 * SCALE

ctx.strokeStyle = '#CCCCCC'
ctx.lineWidth = 1.5 * SCALE
ctx.setLineDash([6 * SCALE, 4 * SCALE])
ctx.beginPath()

// Curved arrow
const cpY = 190 * SCALE
ctx.moveTo(arrowStartX, arrowY)
ctx.quadraticCurveTo((arrowStartX + arrowEndX) / 2, cpY, arrowEndX, arrowY)
ctx.stroke()

// Arrowhead
ctx.setLineDash([])
ctx.beginPath()
ctx.moveTo(arrowEndX, arrowY)
ctx.lineTo(arrowEndX - 8 * SCALE, arrowY - 6 * SCALE)
ctx.moveTo(arrowEndX, arrowY)
ctx.lineTo(arrowEndX - 8 * SCALE, arrowY + 4 * SCALE)
ctx.stroke()

// Export @2x version
const buf2x = canvas.toBuffer('image/png')
const outPath2x = resolve(__dirname, '../resources/dmg-background@2x.png')
writeFileSync(outPath2x, buf2x)
console.log(`DMG background @2x generated: ${outPath2x} (${W}x${H})`)

// Export 1x version (540x380)
const canvas1x = createCanvas(W / SCALE, H / SCALE)
const ctx1x = canvas1x.getContext('2d')
ctx1x.drawImage(canvas, 0, 0, W / SCALE, H / SCALE)
const buf1x = canvas1x.toBuffer('image/png')
const outPath1x = resolve(__dirname, '../resources/dmg-background.png')
writeFileSync(outPath1x, buf1x)
console.log(`DMG background 1x generated: ${outPath1x} (${W / SCALE}x${H / SCALE})`)
