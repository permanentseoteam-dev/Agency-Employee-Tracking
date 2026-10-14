import { describe, expect, it } from 'vitest'
import { TRAY_SIZE, withStatusDot } from './trayIcon'

const GREEN: [number, number, number] = [22, 163, 74]
const px = (buf: Buffer, x: number, y: number) => {
  const i = (y * TRAY_SIZE + x) * 4
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]] // B, G, R, A
}
const solidLogo = () => {
  const logo = Buffer.alloc(TRAY_SIZE * TRAY_SIZE * 4)
  for (let i = 0; i < logo.length; i += 4) logo.set([200, 60, 40, 255], i) // opaque blue (BGRA)
  return logo
}

describe('withStatusDot', () => {
  it('keeps the logo and puts the coloured dot in the bottom-right corner', () => {
    const out = withStatusDot(solidLogo(), GREEN)
    expect(out.length).toBe(TRAY_SIZE * TRAY_SIZE * 4)
    expect(px(out, 4, 4)).toEqual([200, 60, 40, 255]) // logo untouched away from the dot
    expect(px(out, 24, 24)).toEqual([74, 163, 22, 255]) // dot centre in BGRA
  })

  it('draws a white rim between the dot and the logo', () => {
    expect(px(withStatusDot(solidLogo(), GREEN), 24, 19)).toEqual([255, 255, 255, 255]) // 5.5 px from the centre
  })

  it('does not change the logo it was given', () => {
    const logo = solidLogo()
    withStatusDot(logo, GREEN)
    expect(px(logo, 24, 24)).toEqual([200, 60, 40, 255])
  })

  it('falls back to the dot alone when the logo is missing or the wrong size', () => {
    for (const logo of [null, Buffer.alloc(0), Buffer.alloc(100)]) {
      const out = withStatusDot(logo, GREEN)
      expect(out.length).toBe(TRAY_SIZE * TRAY_SIZE * 4)
      expect(px(out, 4, 4)).toEqual([0, 0, 0, 0]) // transparent
      expect(px(out, 24, 24)).toEqual([74, 163, 22, 255])
    }
  })
})
