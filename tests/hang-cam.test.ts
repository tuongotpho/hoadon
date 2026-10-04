import { describe, expect, it } from 'vitest'
import { TU_KHOA_CAM_MAC_DINH as K, timHangCam } from '../src/lib/hangCam'
import { emptyInvoice } from '../src/lib/model'

const hd = (...ten: string[]) => [
  { ...emptyInvoice(), soHd: '322', items: ten.map((t) => ({ ten: t, dvt: '', soLuong: 1, donGia: 0, thanhTien: 100, thueSuat: '' })) },
]
const cam = (...ten: string[]) => timHangCam(hd(...ten), K).map((d) => d.ten)

describe('dò rượu/bia trên hóa đơn', () => {
  it('bắt các kiểu ghi thường gặp', () => {
    expect(cam('Bia Tiger Bạc ( Lon)', 'BIA HÀ NỘI', 'Rượu nếp cái', 'Vang đỏ Chile', 'Heineken lon 330ml', 'Soju Jinro', 'Chivas 18')).toHaveLength(7)
  })
  it('KHÔNG bắt nhầm: bìa, nước ngọt, món ăn bình thường', () => {
    expect(cam('Bìa hồ sơ', 'Twister', 'Nước vối', 'Mực rang muối', 'Phí dịch vụ', 'Cơm rang thập cẩm', 'Nước Tiger-nut'.replace('Tiger-nut', 'cam'))).toEqual([])
  })
  it('khớp nguyên từ: "ginseng" không phải "gin", "rumba" không phải "rum"', () => {
    expect(cam('Trà ginseng', 'Bánh rumba', 'Sakê'.replace('Sakê', 'Bánh sakura'))).toEqual([])
  })
  it('trả kèm số HĐ và từ khóa khớp', () => {
    expect(timHangCam(hd('Bia Tiger Bạc ( Lon)'), K)[0]).toMatchObject({ soHd: '322', tu: 'bia', thanhTien: 100 })
  })
  it('từ khóa nhiều chữ khớp cả khi cách nhiều dấu cách', () => {
    expect(cam('Johnnie  Walker Black')).toHaveLength(1)
  })
})
